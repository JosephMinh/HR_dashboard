#!/usr/bin/env bash
# test-preflight.sh — Verify test infrastructure and mock policy before running integration/e2e tests.
# Usage: ./scripts/test-preflight.sh
#
# Checks:
#   1. Docker is running
#   2. Test database container exists and is healthy
#   3. Port 5433 is accepting connections
#   4. Prisma schema can be pushed
#   5. .env.test exists
#   6. New vi.mock() additions carry explicit quarantine metadata or are in the approved baseline

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}[OK]${NC}   $1"; }
fail() { echo -e "  ${RED}[FAIL]${NC} $1"; }
warn() { echo -e "  ${YELLOW}[WARN]${NC} $1"; }

run_mock_policy_check() {
  python3 <<'PY'
import json
import os
import re
import sys
from pathlib import Path

root = Path.cwd()
inventory_path = root / "__tests__" / "mock-inventory.json"

if not inventory_path.exists():
    print("Mock inventory file is missing: __tests__/mock-inventory.json", file=sys.stderr)
    sys.exit(1)

inventory = json.loads(inventory_path.read_text())
approved_mocks = set()

for entry in inventory.get("inventory", []):
    for mock in entry.get("mocks", []):
        if mock.get("type") == "vi.mock" and isinstance(mock.get("target"), str):
            approved_mocks.add(f"{entry['file']}::{mock['target']}")

scan_roots = [root / "__tests__", root / "src" / "test"]
code_file_pattern = re.compile(r"\.(?:[cm]?[jt]sx?)$")
mock_pattern = re.compile(r"""\bvi\.mock\s*\(\s*(['"])([^'"`]+)\1""")
errors = []
scanned_mocks = 0


def has_quarantine_metadata(lines, line_index):
    start = max(0, line_index - 5)
    context = "\n".join(lines[start : line_index + 1])
    return (
        re.search(r"MOCK_QUARANTINE", context, re.IGNORECASE)
        and re.search(r"owner=", context, re.IGNORECASE)
        and re.search(r"bead=", context, re.IGNORECASE)
        and re.search(r"expires=", context, re.IGNORECASE)
    )


for scan_root in scan_roots:
    if not scan_root.exists():
        continue

    for file_path in scan_root.rglob("*"):
        if not file_path.is_file():
            continue
        if "node_modules" in file_path.parts or ".next" in file_path.parts:
            continue
        if not code_file_pattern.search(file_path.name):
            continue

        lines = file_path.read_text().splitlines()
        relative_path = file_path.relative_to(root).as_posix()
        in_block_comment = False

        for line_index, line in enumerate(lines):
            trimmed_line = line.strip()

            if in_block_comment:
                if "*/" in trimmed_line:
                    in_block_comment = False
                continue

            if trimmed_line.startswith("/*"):
                if "*/" not in trimmed_line:
                    in_block_comment = True
                continue

            if trimmed_line.startswith("//") or trimmed_line.startswith("*"):
                continue

            matches = list(mock_pattern.finditer(line))
            if not matches:
                continue

            for match in matches:
                scanned_mocks += 1
                target = match.group(2)
                signature = f"{relative_path}::{target}"

                if signature in approved_mocks:
                    continue

                if has_quarantine_metadata(lines, line_index):
                    continue

                errors.append(
                    f'{relative_path}:{line_index + 1} adds vi.mock("{target}") outside the approved baseline without '
                    "MOCK_QUARANTINE(owner=..., bead=..., expires=...) metadata."
                )

if errors:
    print("Mock policy violations:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    sys.exit(1)

print(
    f"Mock policy baseline check passed ({len(approved_mocks)} approved vi.mock entries, {scanned_mocks} current vi.mock occurrences scanned)."
)
PY
}

echo "=== Test Infrastructure Preflight Check ==="
echo ""

ERRORS=0

# 1. Docker
if docker info >/dev/null 2>&1; then
  pass "Docker is running"
else
  fail "Docker is not running or not installed"
  ERRORS=$((ERRORS + 1))
fi

# 2. Test DB container
CONTAINER_STATUS=$(docker inspect -f '{{.State.Status}}' hr-dashboard-test-db 2>/dev/null || echo "not_found")
if [ "$CONTAINER_STATUS" = "running" ]; then
  pass "Container hr-dashboard-test-db is running"

  # Check health
  HEALTH=$(docker inspect -f '{{.State.Health.Status}}' hr-dashboard-test-db 2>/dev/null || echo "unknown")
  if [ "$HEALTH" = "healthy" ]; then
    pass "Container health: healthy"
  else
    warn "Container health: $HEALTH (may still be starting)"
  fi
elif [ "$CONTAINER_STATUS" = "not_found" ]; then
  fail "Container hr-dashboard-test-db not found. Run: npm run test:db:up"
  ERRORS=$((ERRORS + 1))
else
  fail "Container hr-dashboard-test-db status: $CONTAINER_STATUS. Run: npm run test:db:up"
  ERRORS=$((ERRORS + 1))
fi

# 3. Port 5433
if nc -z localhost 5433 2>/dev/null; then
  pass "Port 5433 is accepting connections"
else
  fail "Port 5433 is not accepting connections"
  ERRORS=$((ERRORS + 1))
fi

# 4. .env.test
if [ -f ".env.test" ]; then
  pass ".env.test exists"
else
  warn ".env.test not found — tests will use hardcoded defaults"
fi

# 5. Mock policy baseline
echo ""
echo "  Checking mock policy baseline..."
if run_mock_policy_check >/tmp/hr-dashboard-mock-policy.log 2>&1; then
  pass "$(cat /tmp/hr-dashboard-mock-policy.log)"
else
  fail "Mock policy baseline check failed"
  cat /tmp/hr-dashboard-mock-policy.log
  ERRORS=$((ERRORS + 1))
fi

# 6. Schema push (only if container is running)
if [ "$CONTAINER_STATUS" = "running" ] && nc -z localhost 5433 2>/dev/null; then
  echo ""
  echo "  Pushing Prisma schema to test database..."
  if DATABASE_URL="postgresql://postgres:postgres@localhost:5433/hr_dashboard_test?schema=public" npx prisma db push --accept-data-loss >/dev/null 2>&1; then
    pass "Schema pushed successfully"
  else
    fail "Schema push failed. Check: docker logs hr-dashboard-test-db"
    ERRORS=$((ERRORS + 1))
  fi
fi

echo ""
if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}All checks passed. Ready to run integration tests.${NC}"
  echo ""
  echo "  bun run test:integration     # integration tests"
  echo "  bun run test:e2e             # e2e tests"
else
  echo -e "${RED}${ERRORS} check(s) failed. Fix the issues above before running tests.${NC}"
  echo ""
  echo "Quick fix: npm run test:db:up"
  exit 1
fi
