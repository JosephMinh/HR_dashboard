#!/usr/bin/env bash
#
# Full-stack test runner
#
# Orchestrates: lint → tsc → unit tests → integration tests → E2E tests
# Each stage logs clearly and fails fast on error.
#
# Usage:
#   ./scripts/test-all.sh              # Run all stages
#   ./scripts/test-all.sh --skip-e2e   # Skip E2E (no browser needed)
#   ./scripts/test-all.sh --only unit  # Run only unit tests
#   ./scripts/test-all.sh --only integration
#   ./scripts/test-all.sh --only e2e
#
# Environment:
#   SKIP_LINT=1        Skip lint stage
#   SKIP_TSC=1         Skip type-check stage
#   SKIP_UNIT=1        Skip unit tests
#   SKIP_INTEGRATION=1 Skip integration tests
#   SKIP_E2E=1         Skip E2E tests
#   DEBUG_PRISMA=true  Show Prisma output during schema push

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

# Parse arguments
for arg in "$@"; do
  case "$arg" in
    --skip-e2e)
      SKIP_E2E=1
      ;;
    --skip-lint)
      SKIP_LINT=1
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

START_TIME=$(date +%s)

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
  stage "Unit Tests"
  if npx vitest run 2>&1; then
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
  stage "Integration Tests"

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

    if npx vitest run --config vitest.config.integration.ts 2>&1; then
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
