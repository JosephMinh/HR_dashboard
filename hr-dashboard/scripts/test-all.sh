#!/usr/bin/env bash
#
# Full-stack test runner
#
# Orchestrates: lint → tsc → unit tests → integration tests → E2E tests
# Each stage logs clearly and fails fast on error.
#
# Usage:
#   ./scripts/test-all.sh                    # Run all stages
#   ./scripts/test-all.sh --coverage         # Run unit/integration stages with coverage gates
#   ./scripts/test-all.sh --diff-coverage    # After coverage, run diff-aware per-file guard
#   ./scripts/test-all.sh --skip-e2e         # Skip E2E (no browser needed)
#   ./scripts/test-all.sh --only unit        # Run only unit tests
#   ./scripts/test-all.sh --only integration
#   ./scripts/test-all.sh --only e2e
#
# Environment:
#   SKIP_LINT=1           Skip lint stage
#   SKIP_TSC=1            Skip type-check stage
#   SKIP_UNIT=1           Skip unit tests
#   SKIP_INTEGRATION=1    Skip integration tests
#   SKIP_E2E=1            Skip E2E tests
#   DIFF_COVERAGE=1       Enable diff-aware coverage guard (same as --diff-coverage)
#   DIFF_COVERAGE_BASE    Base git ref for diff (default: origin/main)
#   DIFF_COVERAGE_WARN=1  Run guard but don't fail build on violations
#   DEBUG_PRISMA=true     Show Prisma output during schema push

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SKIP_E2E="${SKIP_E2E:-0}"
SKIP_LINT="${SKIP_LINT:-0}"
SKIP_TSC="${SKIP_TSC:-0}"
SKIP_UNIT="${SKIP_UNIT:-0}"
SKIP_INTEGRATION="${SKIP_INTEGRATION:-0}"
RUN_COVERAGE="${RUN_COVERAGE:-0}"
DIFF_COVERAGE="${DIFF_COVERAGE:-0}"
DIFF_COVERAGE_BASE="${DIFF_COVERAGE_BASE:-}"
DIFF_COVERAGE_WARN="${DIFF_COVERAGE_WARN:-0}"
QUARANTINE_ONLY="${QUARANTINE_ONLY:-0}"
QUARANTINE_MANIFEST="${QUARANTINE_MANIFEST:-./test-quarantine.json}"

if [ -n "${CI:-}" ]; then
  DEFAULT_FAIL_ON_FLAKES=1
else
  DEFAULT_FAIL_ON_FLAKES=0
fi

FAIL_ON_UNAPPROVED_FLAKES="${FAIL_ON_UNAPPROVED_FLAKES:-$DEFAULT_FAIL_ON_FLAKES}"
FAIL_ON_EXPIRED_QUARANTINE="${FAIL_ON_EXPIRED_QUARANTINE:-$DEFAULT_FAIL_ON_FLAKES}"

# Parse arguments
for arg in "$@"; do
  case "$arg" in
    --skip-e2e)
      SKIP_E2E=1
      ;;
    --skip-lint)
      SKIP_LINT=1
      ;;
    --coverage)
      RUN_COVERAGE=1
      ;;
    --diff-coverage)
      DIFF_COVERAGE=1
      ;;
    --only)
      # Next arg handled below
      ;;
    unit)
      SKIP_LINT=1; SKIP_TSC=1; SKIP_INTEGRATION=1; SKIP_E2E=1
      ;;
    integration)
      SKIP_LINT=1; SKIP_TSC=1; SKIP_UNIT=1; SKIP_E2E=1
      ;;
    e2e)
      SKIP_LINT=1; SKIP_TSC=1; SKIP_UNIT=1; SKIP_INTEGRATION=1
      ;;
    quarantine|--quarantine)
      SKIP_LINT=1; SKIP_TSC=1; SKIP_UNIT=1; SKIP_INTEGRATION=1; SKIP_E2E=1
      QUARANTINE_ONLY=1
      ;;
  esac
done

PASSED=0
FAILED=0
SKIPPED=0

stage() {
  local name="$1"
  echo -e "\n${BLUE}━━━ Stage: ${name} ━━━${NC}"
}

pass() {
  local name="$1"
  echo -e "${GREEN}✓ ${name} passed${NC}"
  PASSED=$((PASSED + 1))
}

fail() {
  local name="$1"
  echo -e "${RED}✗ ${name} FAILED${NC}"
  FAILED=$((FAILED + 1))
}

skip() {
  local name="$1"
  echo -e "${YELLOW}⊘ ${name} skipped${NC}"
  SKIPPED=$((SKIPPED + 1))
}

warn() {
  local message="$1"
  echo -e "${YELLOW}! ${message}${NC}"
}

generate_combined_coverage_report() {
  if [ "$RUN_COVERAGE" != "1" ]; then
    skip "Combined Coverage Report"
    return 0
  fi

  if [ "$SKIP_UNIT" = "1" ] || [ "$SKIP_INTEGRATION" = "1" ]; then
    warn "Combined coverage report requires both unit and integration coverage runs."
    skip "Combined Coverage Report"
    return 0
  fi

  if [ ! -f "./coverage/coverage-final.json" ] || [ ! -f "./coverage/integration/coverage-final.json" ]; then
    warn "Coverage merge skipped because one or more raw coverage artifacts are missing."
    skip "Combined Coverage Report"
    return 0
  fi

  stage "Combined Coverage Report"
  if npm run coverage:merge 2>&1; then
    pass "Combined Coverage Report"
  else
    fail "Combined Coverage Report"
    return 1
  fi
}

validate_quarantine_manifest() {
  if [ ! -f "$QUARANTINE_MANIFEST" ]; then
    warn "Quarantine manifest not found at $QUARANTINE_MANIFEST"
    return 0
  fi

  MANIFEST_PATH="$QUARANTINE_MANIFEST" python3 - <<'PY'
import json
import os
import re
import sys

manifest_path = os.environ["MANIFEST_PATH"]
with open(manifest_path, "r", encoding="utf-8") as handle:
    manifest = json.load(handle)

errors = []

if not isinstance(manifest, dict):
    errors.append("Manifest must be a JSON object.")

entries = manifest.get("entries")
if not isinstance(entries, list):
    errors.append("Manifest must include an entries array.")
    entries = []

for index, entry in enumerate(entries):
    prefix = f"entries[{index}]"
    if not isinstance(entry.get("id"), str) or not entry["id"]:
        errors.append(f"{prefix}.id is required")
    if entry.get("runner") not in {"unit", "integration", "e2e"}:
        errors.append(f"{prefix}.runner must be unit|integration|e2e")
    if not isinstance(entry.get("file"), str) or not entry["file"]:
        errors.append(f"{prefix}.file is required")
    if not isinstance(entry.get("owner"), str) or not entry["owner"]:
        errors.append(f"{prefix}.owner is required")
    expires_on = entry.get("expiresOn", "")
    if not isinstance(expires_on, str) or not re.match(r"^\d{4}-\d{2}-\d{2}$", expires_on):
        errors.append(f"{prefix}.expiresOn must be YYYY-MM-DD")
    if not isinstance(entry.get("reason"), str) or not entry["reason"]:
        errors.append(f"{prefix}.reason is required")

if errors:
    for error in errors:
        print(f"[QUARANTINE] {error}", file=sys.stderr)
    sys.exit(1)
PY
}

run_quarantine_entry() {
  local runner="$1"
  local file="$2"
  local pattern="$3"
  local owner="$4"
  local expires="$5"

  echo "Running quarantined ${runner} target: ${file} (owner=${owner}, expires=${expires})"

  case "$runner" in
    unit)
      local cmd=(npx vitest run "$file")
      if [ -n "$pattern" ]; then
        cmd+=(-t "$pattern")
      fi
      "${cmd[@]}"
      ;;
    integration)
      local cmd=(npx vitest run --config vitest.config.integration.ts "$file")
      if [ -n "$pattern" ]; then
        cmd+=(-t "$pattern")
      fi
      "${cmd[@]}"
      ;;
    e2e)
      local cmd=(npm run test:e2e -- "$file")
      if [ -n "$pattern" ]; then
        cmd+=(--grep "$pattern")
      fi
      "${cmd[@]}"
      ;;
    *)
      echo -e "${RED}Unknown quarantine runner: ${runner}${NC}"
      return 1
      ;;
  esac
}

run_quarantine_lane() {
  if ! validate_quarantine_manifest; then
    fail "Quarantine Lane"
    return 1
  fi

  if [ ! -f "$QUARANTINE_MANIFEST" ]; then
    skip "Quarantine Lane"
    return 0
  fi

  local entry_output
  if ! entry_output=$(
    MANIFEST_PATH="$QUARANTINE_MANIFEST" python3 - <<'PY'
import json
import os
import sys
from datetime import date

manifest_path = os.environ["MANIFEST_PATH"]
with open(manifest_path, "r", encoding="utf-8") as handle:
    manifest = json.load(handle)

today = date.today().isoformat()
expired = False

for entry in manifest.get("entries", []):
    if entry["expiresOn"] < today:
        print(
            f"[QUARANTINE] Expired entry: {entry['id']} ({entry['file']}) owned by {entry['owner']}, expired {entry['expiresOn']}",
            file=sys.stderr,
        )
        expired = True
        continue

    print(
        "\t".join(
            [
                entry["runner"],
                entry["file"],
                entry.get("testNamePattern", ""),
                entry["owner"],
                entry["expiresOn"],
            ]
        )
    )

if expired:
    sys.exit(2)
PY
  ); then
    fail "Quarantine Lane"
    return 1
  fi

  if [ -z "$entry_output" ]; then
    skip "Quarantine Lane"
    return 0
  fi

  stage "Quarantine Lane"
  local lane_failed=0
  while IFS=$'\t' read -r runner file pattern owner expires; do
    if ! run_quarantine_entry "$runner" "$file" "$pattern" "$owner" "$expires"; then
      lane_failed=1
    fi
  done <<< "$entry_output"

  if [ "$lane_failed" = "1" ]; then
    fail "Quarantine Lane"
    return 1
  fi

  pass "Quarantine Lane"
  return 0
}

generate_flake_summary() {
  mkdir -p test-results

  QUARANTINE_MANIFEST="$QUARANTINE_MANIFEST" \
  FAIL_ON_UNAPPROVED_FLAKES="$FAIL_ON_UNAPPROVED_FLAKES" \
  FAIL_ON_EXPIRED_QUARANTINE="$FAIL_ON_EXPIRED_QUARANTINE" \
  python3 - <<'PY'
import json
import os
import pathlib
import re
import sys
from datetime import date, datetime, timezone


def read_json(file_path: pathlib.Path, fallback):
    if not file_path.exists():
        return fallback
    with open(file_path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def safe_match(pattern: str, text: str) -> bool:
    try:
        return re.search(pattern, text) is not None
    except re.error:
        return False


manifest_path = pathlib.Path(os.environ.get("QUARANTINE_MANIFEST", "./test-quarantine.json"))
fail_on_unapproved = os.environ.get("FAIL_ON_UNAPPROVED_FLAKES") == "1"
fail_on_expired = os.environ.get("FAIL_ON_EXPIRED_QUARANTINE") == "1"
manifest = read_json(manifest_path, {"entries": []})
today = date.today().isoformat()
suite_reports = [
    ("unit", pathlib.Path("test-results/vitest/report.json")),
    ("integration", pathlib.Path("test-results/integration/report.json")),
]

summary = {
    "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
    "manifest": str(manifest_path),
    "suites": {},
    "totals": {
        "retriedTests": 0,
        "retryAttempts": 0,
        "flakyTests": 0,
        "quarantinedFlakes": 0,
        "unapprovedFlakes": 0,
    },
    "expiredEntries": [],
    "flakyTests": [],
}

entries = manifest.get("entries", [])
for entry in entries:
    if entry["expiresOn"] < today:
        summary["expiredEntries"].append(
            {
                "id": entry["id"],
                "runner": entry["runner"],
                "file": entry["file"],
                "owner": entry["owner"],
                "expiresOn": entry["expiresOn"],
            }
        )


def find_manifest_match(runner: str, test: dict):
    for entry in entries:
        if entry["runner"] != runner:
            continue
        if entry["file"] != test.get("file"):
            continue
        pattern = entry.get("testNamePattern")
        if not pattern or safe_match(pattern, test.get("fullName", "")):
            return entry
    return None


for runner, report_path in suite_reports:
    report = read_json(report_path, None)
    if report is None:
        continue

    tests = report.get("tests", [])
    retried_tests = [test for test in tests if (test.get("retryCount") or 0) > 0]
    flaky_tests = [test for test in retried_tests if bool(test.get("flaky"))]

    summary["suites"][runner] = {
        "report": str(report_path),
        "retriedTests": len(retried_tests),
        "retryAttempts": sum((test.get("retryCount") or 0) for test in retried_tests),
        "flakyTests": len(flaky_tests),
    }

    summary["totals"]["retriedTests"] += len(retried_tests)
    summary["totals"]["retryAttempts"] += sum((test.get("retryCount") or 0) for test in retried_tests)
    summary["totals"]["flakyTests"] += len(flaky_tests)

    for test in flaky_tests:
        match = find_manifest_match(runner, test)
        if match:
            summary["totals"]["quarantinedFlakes"] += 1
        else:
            summary["totals"]["unapprovedFlakes"] += 1

        summary["flakyTests"].append(
            {
                "runner": runner,
                "file": test.get("file"),
                "fullName": test.get("fullName"),
                "retryCount": test.get("retryCount") or 0,
                "match": None
                if match is None
                else {
                    "id": match["id"],
                    "owner": match["owner"],
                    "expiresOn": match["expiresOn"],
                },
            }
        )


text = [
    "Flake Summary",
    f"Generated: {summary['generatedAt']}",
    f"Manifest: {summary['manifest']}",
    "",
    "Totals: "
    f"retried-tests={summary['totals']['retriedTests']} "
    f"retry-attempts={summary['totals']['retryAttempts']} "
    f"flaky-tests={summary['totals']['flakyTests']} "
    f"quarantined={summary['totals']['quarantinedFlakes']} "
    f"unapproved={summary['totals']['unapprovedFlakes']}",
]

for runner, suite in summary["suites"].items():
    text.append(
        f"- {runner}: retried={suite['retriedTests']} "
        f"retry-attempts={suite['retryAttempts']} flaky={suite['flakyTests']}"
    )

if summary["flakyTests"]:
    text.extend(["", "Flaky tests:"])
    for test in summary["flakyTests"]:
        if test["match"] is None:
            text.append(
                f"- {test['runner']}: {test['fullName']} ({test['file']}) "
                f"retry x{test['retryCount']} UNAPPROVED"
            )
        else:
            text.append(
                f"- {test['runner']}: {test['fullName']} ({test['file']}) "
                f"retry x{test['retryCount']} quarantined={test['match']['id']} "
                f"owner={test['match']['owner']} expires={test['match']['expiresOn']}"
            )

if summary["expiredEntries"]:
    text.extend(["", "Expired quarantine entries:"])
    for entry in summary["expiredEntries"]:
        text.append(
            f"- {entry['id']}: {entry['file']} owner={entry['owner']} expired={entry['expiresOn']}"
        )

summary_json_path = pathlib.Path("test-results/flake-summary.json")
summary_text_path = pathlib.Path("test-results/flake-summary.txt")
summary_json_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
summary_text_path.write_text("\n".join(text) + "\n", encoding="utf-8")
print("\n".join(text))

if (
    summary["totals"]["unapprovedFlakes"] > 0
    and fail_on_unapproved
) or (
    summary["expiredEntries"]
    and fail_on_expired
):
    sys.exit(2)
PY
}

START_TIME=$(date +%s)

if [ "$QUARANTINE_ONLY" = "1" ]; then
  START_TIME=$(date +%s)
  if run_quarantine_lane; then
    END_TIME=$(date +%s)
    ELAPSED=$((END_TIME - START_TIME))
    echo -e "\n${BLUE}━━━ Summary ━━━${NC}"
    echo -e "  ${GREEN}Passed:  ${PASSED}${NC}"
    [ "$FAILED" -gt 0 ] && echo -e "  ${RED}Failed:  ${FAILED}${NC}" || echo -e "  Failed:  0"
    [ "$SKIPPED" -gt 0 ] && echo -e "  ${YELLOW}Skipped: ${SKIPPED}${NC}" || echo -e "  Skipped: 0"
    echo -e "  Time:    ${ELAPSED}s"
    exit 0
  fi

  END_TIME=$(date +%s)
  ELAPSED=$((END_TIME - START_TIME))
  echo -e "\n${BLUE}━━━ Summary ━━━${NC}"
  echo -e "  ${GREEN}Passed:  ${PASSED}${NC}"
  [ "$FAILED" -gt 0 ] && echo -e "  ${RED}Failed:  ${FAILED}${NC}" || echo -e "  Failed:  0"
  [ "$SKIPPED" -gt 0 ] && echo -e "  ${YELLOW}Skipped: ${SKIPPED}${NC}" || echo -e "  Skipped: 0"
  echo -e "  Time:    ${ELAPSED}s"
  exit 1
fi

# ──────────────────────────────────────────────────────
# Stage 1: Lint
# ──────────────────────────────────────────────────────
if [ "$SKIP_LINT" = "1" ]; then
  skip "Lint"
else
  stage "Lint"
  if npx eslint --max-warnings 0 . 2>&1; then
    pass "Lint"
  else
    fail "Lint"
    echo -e "${RED}Lint failed. Fix the above issues and re-run.${NC}"
    exit 1
  fi
fi

# ──────────────────────────────────────────────────────
# Stage 2: TypeScript
# ──────────────────────────────────────────────────────
if [ "$SKIP_TSC" = "1" ]; then
  skip "TypeScript"
else
  stage "TypeScript"
  if npx tsc --noEmit 2>&1; then
    pass "TypeScript"
  else
    fail "TypeScript"
    echo -e "${RED}Type errors found. Fix the above issues and re-run.${NC}"
    exit 1
  fi
fi

# ──────────────────────────────────────────────────────
# Stage 3: Unit Tests
# ──────────────────────────────────────────────────────
if [ "$SKIP_UNIT" = "1" ]; then
  skip "Unit Tests"
else
  if [ "$RUN_COVERAGE" = "1" ]; then
    stage "Unit Tests + Coverage"
  else
    stage "Unit Tests"
  fi

  unit_cmd=(npx vitest run)
  if [ "$RUN_COVERAGE" = "1" ]; then
    unit_cmd+=(--coverage)
  fi

  if "${unit_cmd[@]}" 2>&1; then
    pass "Unit Tests"
  else
    fail "Unit Tests"
  fi
fi

# ──────────────────────────────────────────────────────
# Stage 4: Integration Tests
# ──────────────────────────────────────────────────────
if [ "$SKIP_INTEGRATION" = "1" ]; then
  skip "Integration Tests"
else
  if [ "$RUN_COVERAGE" = "1" ]; then
    stage "Integration Tests + Coverage"
  else
    stage "Integration Tests"
  fi

  # Check if test DB is accessible
  echo "Checking test database..."
  if ! nc -z localhost 5433 2>/dev/null; then
    echo -e "${YELLOW}Test database not reachable on port 5433. Starting...${NC}"
    if npm run test:db:up 2>&1; then
      echo "Waiting for database to accept connections..."
      for i in $(seq 1 30); do
        if nc -z localhost 5433 2>/dev/null; then
          echo "Database ready."
          break
        fi
        sleep 1
      done
    else
      echo -e "${RED}Failed to start test database. Skipping integration tests.${NC}"
      fail "Integration Tests (DB unavailable)"
    fi
  fi

  if nc -z localhost 5433 2>/dev/null; then
    # Push schema
    echo "Pushing schema to test database..."
    npm run test:db:push 2>&1 || true

    integration_cmd=(npx vitest run --config vitest.config.integration.ts)
    if [ "$RUN_COVERAGE" = "1" ]; then
      integration_cmd+=(--coverage)
    fi

    if "${integration_cmd[@]}" 2>&1; then
      pass "Integration Tests"
    else
      fail "Integration Tests"
    fi
  fi
fi

# ──────────────────────────────────────────────────────
# Stage 5: E2E Tests
# ──────────────────────────────────────────────────────
if [ "$SKIP_E2E" = "1" ]; then
  skip "E2E Tests"
else
  stage "E2E Tests"

  # Ensure Playwright browsers are installed
  if ! npx playwright install --dry-run chromium >/dev/null 2>&1; then
    echo "Installing Playwright browsers..."
    npx playwright install chromium 2>&1
  fi

  if npm run test:e2e 2>&1; then
    pass "E2E Tests"
  else
    fail "E2E Tests"
  fi
fi

# ──────────────────────────────────────────────────────
# Stage 6: Combined Coverage Report
# ──────────────────────────────────────────────────────
if ! generate_combined_coverage_report; then
  exit 1
fi

# ──────────────────────────────────────────────────────
# Stage 7: Flake Summary
# ──────────────────────────────────────────────────────
stage "Flake Summary"
if generate_flake_summary; then
  pass "Flake Summary"
else
  fail "Flake Summary"
fi

# ──────────────────────────────────────────────────────
# Stage 8: Diff Coverage Guard (optional — requires --coverage)
# ──────────────────────────────────────────────────────
if [ "$DIFF_COVERAGE" = "1" ] && [ "$RUN_COVERAGE" = "1" ]; then
  stage "Diff Coverage Guard"

  diff_coverage_args=()
  if [ -n "$DIFF_COVERAGE_BASE" ]; then
    diff_coverage_args+=(--base "$DIFF_COVERAGE_BASE")
  fi
  if [ "$DIFF_COVERAGE_WARN" = "1" ]; then
    diff_coverage_args+=(--warn-only)
  fi

  if bun run scripts/coverage-diff.ts "${diff_coverage_args[@]}" 2>&1; then
    pass "Diff Coverage Guard"
  else
    fail "Diff Coverage Guard"
  fi
elif [ "$DIFF_COVERAGE" = "1" ] && [ "$RUN_COVERAGE" = "0" ]; then
  warn "Diff Coverage Guard skipped: requires --coverage flag to also generate coverage report"
  skip "Diff Coverage Guard"
fi

# ──────────────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────────────
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo -e "\n${BLUE}━━━ Summary ━━━${NC}"
echo -e "  ${GREEN}Passed:  ${PASSED}${NC}"
[ "$FAILED" -gt 0 ] && echo -e "  ${RED}Failed:  ${FAILED}${NC}" || echo -e "  Failed:  0"
[ "$SKIPPED" -gt 0 ] && echo -e "  ${YELLOW}Skipped: ${SKIPPED}${NC}" || echo -e "  Skipped: 0"
echo -e "  Time:    ${ELAPSED}s"

if [ "$FAILED" -gt 0 ]; then
  echo -e "\n${RED}Some stages failed. See output above for details.${NC}"
  exit 1
else
  echo -e "\n${GREEN}All stages passed!${NC}"
  exit 0
fi
