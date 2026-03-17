#!/usr/bin/env bash
#
# coverage-guard.sh — Diff-aware per-file coverage check.
#
# Prevents new code from hiding behind aggregate legacy coverage by checking
# that files changed on this branch individually meet a branch-coverage
# threshold, using Istanbul JSON-summary reports produced by Vitest.
#
# Usage:
#   ./scripts/coverage-guard.sh                        # Diff vs main, run unit coverage
#   ./scripts/coverage-guard.sh --base origin/main     # Explicit base ref
#   ./scripts/coverage-guard.sh --threshold 70         # Override threshold (%, default: 60)
#   ./scripts/coverage-guard.sh --suite integration    # Run integration suite
#   ./scripts/coverage-guard.sh --suite both           # Run unit + integration
#   ./scripts/coverage-guard.sh --no-run               # Use pre-existing coverage reports
#
# In CI the recommended flow is:
#   bun run test:coverage                              # produces coverage/coverage-summary.json
#   bun run test:integration:coverage                  # produces coverage/integration/coverage-summary.json
#   ./scripts/coverage-guard.sh --no-run --base origin/main
#
# For a local pre-push hook (fast, unit only):
#   ./scripts/coverage-guard.sh --base main
#
# Environment overrides:
#   BASE_REF        Git ref to diff against (same as --base)
#   THRESHOLD       Branch coverage threshold % (same as --threshold)
#   COVERAGE_SUITE  unit | integration | both (same as --suite)
#   NO_RUN          1 = use pre-existing reports only (same as --no-run)
#   GUARD_VERBOSE   1 = show extra detail per file

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

pass()  { echo -e "  ${GREEN}[PASS]${NC} $1"; }
fail()  { echo -e "  ${RED}[FAIL]${NC} $1"; }
info()  { echo -e "  ${BLUE}[INFO]${NC} $1"; }
warn()  { echo -e "  ${YELLOW}[WARN]${NC} $1"; }
skip()  { echo -e "  ${CYAN}[SKIP]${NC} $1"; }

# =====================================================================
# Argument parsing
# =====================================================================

BASE_REF="${BASE_REF:-}"
THRESHOLD="${THRESHOLD:-60}"
COVERAGE_SUITE="${COVERAGE_SUITE:-unit}"
NO_RUN="${NO_RUN:-0}"
GUARD_VERBOSE="${GUARD_VERBOSE:-0}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)        BASE_REF="$2";       shift 2 ;;
    --threshold)   THRESHOLD="$2";     shift 2 ;;
    --suite)       COVERAGE_SUITE="$2"; shift 2 ;;
    --no-run)      NO_RUN=1;           shift 1 ;;
    --verbose|-v)  GUARD_VERBOSE=1;    shift 1 ;;
    --help|-h)
      sed -n '2,/^[^#]/p' "$0" | grep '^#' | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# Resolve base ref (prefer explicitly set over auto-detect)
if [[ -z "$BASE_REF" ]]; then
  if git rev-parse --verify "origin/main" >/dev/null 2>&1; then
    BASE_REF="origin/main"
  elif git rev-parse --verify "main" >/dev/null 2>&1; then
    BASE_REF="main"
  elif git rev-parse --verify "origin/master" >/dev/null 2>&1; then
    BASE_REF="origin/master"
  elif git rev-parse --verify "master" >/dev/null 2>&1; then
    BASE_REF="master"
  else
    BASE_REF="HEAD~1"
  fi
fi

# =====================================================================
# Identify changed source files
# =====================================================================

echo ""
echo "=== Coverage Guard (diff-aware) ==="
echo ""
info "Base ref    : $BASE_REF"
info "Threshold   : ${THRESHOLD}% branch coverage (per changed file)"
info "Suite       : $COVERAGE_SUITE"
info "Run coverage: $([ "$NO_RUN" = "1" ] && echo "no (using pre-existing reports)" || echo "yes")"
echo ""

# Try three-dot diff first (branch diff), fall back to two-dot (CI detached HEAD)
CHANGED_RAW=$(
  git diff --name-only "${BASE_REF}...HEAD" 2>/dev/null ||
  git diff --name-only "${BASE_REF}" 2>/dev/null ||
  true
)

# Filter to covered source files: src/app/api/**/*.ts and src/lib/**/*.ts
CHANGED_FILES=()
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  [[ "$f" == *.d.ts ]] && continue
  [[ "$f" == *.test.ts ]] && continue
  [[ "$f" == *.spec.ts ]] && continue
  [[ "$f" == *generated* ]] && continue
  [[ "$f" == *node_modules* ]] && continue
  # Restrict to the paths that vitest coverage is configured to include
  if [[ "$f" == src/app/api/*.ts ]] || [[ "$f" == src/app/api/**/*.ts ]] ||
     [[ "$f" == src/lib/*.ts ]] || [[ "$f" == src/lib/**/*.ts ]]; then
    [[ -f "$f" ]] && CHANGED_FILES+=("$f")
  fi
done <<< "$CHANGED_RAW"

if [[ ${#CHANGED_FILES[@]} -eq 0 ]]; then
  pass "No covered source files changed — nothing to guard."
  echo ""
  exit 0
fi

info "Changed covered files (${#CHANGED_FILES[@]}):"
for f in "${CHANGED_FILES[@]}"; do
  echo "        $f"
done
echo ""

# =====================================================================
# Run coverage (unless --no-run / NO_RUN=1)
# =====================================================================

UNIT_SUMMARY="coverage/coverage-summary.json"
INTEGRATION_SUMMARY="coverage/integration/coverage-summary.json"

if [[ "$NO_RUN" != "1" ]]; then
  echo "--- Running coverage ---"
  echo ""

  if [[ "$COVERAGE_SUITE" == "unit" || "$COVERAGE_SUITE" == "both" ]]; then
    info "Running unit coverage…"
    if ! bunx vitest run --coverage \
         --coverage.reporter=json-summary \
         --coverage.reportsDirectory=coverage \
         --reporter=dot \
         2>&1 | tail -5; then
      warn "Unit coverage run exited non-zero (threshold failures are expected here)"
    fi
  fi

  if [[ "$COVERAGE_SUITE" == "integration" || "$COVERAGE_SUITE" == "both" ]]; then
    info "Running integration coverage…"
    if ! bunx vitest run \
         --config vitest.config.integration.ts \
         --coverage \
         --coverage.reporter=json-summary \
         --coverage.reportsDirectory=coverage/integration \
         --reporter=dot \
         2>&1 | tail -5; then
      warn "Integration coverage run exited non-zero (threshold failures are expected here)"
    fi
  fi

  echo ""
fi

# =====================================================================
# Load coverage data from JSON summaries
# =====================================================================

# coverage_data maps normalized relative path → metrics dict (as JSON string)
# We merge unit and integration, preferring the HIGHER branch coverage for each file
load_coverage_summary() {
  local summary_file="$1"
  local output_file="$2"

  if [[ ! -f "$summary_file" ]]; then
    warn "Coverage summary not found: $summary_file"
    return
  fi

  # Use python to normalize paths and write a flat key=pct map
  python3 - "$summary_file" "$output_file" <<'PY'
import json, sys
from pathlib import Path

summary_path = Path(sys.argv[1])
output_path = Path(sys.argv[2])

data = json.loads(summary_path.read_text())
result = {}
for key, val in data.items():
    if key == "total":
        continue
    # Normalize to a relative path from project root
    # Istanbul uses absolute paths; strip everything up to and including 'src/'
    norm = key
    for prefix in ("./", "/"):
        if norm.startswith(prefix):
            norm = norm.lstrip(prefix)
    # Find 'src/' anchor and strip absolute prefix
    idx = norm.find("src/")
    if idx >= 0:
        norm = norm[idx:]
    if not norm.startswith("src/"):
        continue
    branches = val.get("branches", {})
    total = branches.get("total", 0)
    covered = branches.get("covered", 0)
    pct = round(100 * covered / total) if total > 0 else 100
    result[norm] = pct

with open(output_path, "w") as f:
    json.dump(result, f)
PY
}

UNIT_MAP=$(mktemp /tmp/coverage-guard-unit.XXXXXX.json)
INTEGRATION_MAP=$(mktemp /tmp/coverage-guard-integration.XXXXXX.json)
trap 'rm -f "$UNIT_MAP" "$INTEGRATION_MAP"' EXIT

echo "{}" > "$UNIT_MAP"
echo "{}" > "$INTEGRATION_MAP"

if [[ "$COVERAGE_SUITE" == "unit" || "$COVERAGE_SUITE" == "both" || "$NO_RUN" == "1" ]]; then
  load_coverage_summary "$UNIT_SUMMARY" "$UNIT_MAP"
fi

if [[ "$COVERAGE_SUITE" == "integration" || "$COVERAGE_SUITE" == "both" || "$NO_RUN" == "1" ]]; then
  load_coverage_summary "$INTEGRATION_SUMMARY" "$INTEGRATION_MAP"
fi

# =====================================================================
# Check each changed file against threshold
# =====================================================================

PASSED=()
FAILED=()
SKIPPED=()

for src_file in "${CHANGED_FILES[@]}"; do
  # Look up in unit and integration maps; take the best (highest) coverage
  result=$(python3 - "$src_file" "$UNIT_MAP" "$INTEGRATION_MAP" <<'PY'
import json, sys
from pathlib import Path

target = sys.argv[1]
unit_map = json.loads(Path(sys.argv[2]).read_text())
integ_map = json.loads(Path(sys.argv[3]).read_text())

# Try exact match, then suffix match
def lookup(d, key):
    if key in d:
        return d[key]
    for k, v in d.items():
        if k.endswith(key) or key.endswith(k):
            return v
    return None

unit_pct = lookup(unit_map, target)
integ_pct = lookup(integ_map, target)

if unit_pct is None and integ_pct is None:
    print("missing")
else:
    vals = [v for v in [unit_pct, integ_pct] if v is not None]
    best = max(vals)
    sources = []
    if unit_pct is not None:
        sources.append(f"unit:{unit_pct}%")
    if integ_pct is not None:
        sources.append(f"integration:{integ_pct}%")
    print(f"{best} {','.join(sources)}")
PY
)

  if [[ "$result" == "missing" ]]; then
    skip "$src_file — no coverage data found (add tests for this file)"
    SKIPPED+=("$src_file")
    continue
  fi

  branch_pct="${result%% *}"
  sources="${result#* }"

  detail=""
  if [[ "$GUARD_VERBOSE" == "1" ]]; then
    detail=" [$sources]"
  fi

  if [[ "$branch_pct" -ge "$THRESHOLD" ]]; then
    pass "$src_file — ${branch_pct}% branch${detail}"
    PASSED+=("$src_file")
  else
    fail "$src_file — ${branch_pct}% branch (need ${THRESHOLD}%)${detail}"
    FAILED+=("$src_file:${branch_pct}%")
  fi
done

# =====================================================================
# Final report
# =====================================================================

echo ""
echo "=== Coverage Guard Summary ==="
echo ""
echo "  Changed files checked : ${#CHANGED_FILES[@]}"
echo "  Passed                : ${#PASSED[@]}"
echo "  Failed                : ${#FAILED[@]}"
echo "  Skipped (no data)     : ${#SKIPPED[@]}"
echo ""

if [[ ${#SKIPPED[@]} -gt 0 ]]; then
  warn "These changed files have no coverage data in the selected suite(s):"
  for f in "${SKIPPED[@]}"; do
    echo "      $f"
  done
  echo "  Tip: run with --suite both to check unit + integration coverage."
  echo "  Files without coverage data are not counted as failures."
  echo ""
fi

if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo -e "${RED}Coverage guard FAILED — the following changed files are below ${THRESHOLD}% branch coverage:${NC}"
  for entry in "${FAILED[@]}"; do
    file="${entry%%:*}"
    pct="${entry#*:}"
    echo -e "  ${RED}✗${NC}  $file  →  $pct (need ${THRESHOLD}%)"
  done
  echo ""
  echo "  How to fix:"
  echo "    1. Add tests for the uncovered branches in each failing file."
  echo "    2. Re-run: ./scripts/coverage-guard.sh --base $BASE_REF"
  echo "    3. If the threshold is too strict for this file, raise a bead or"
  echo "       add a targeted exception with justification."
  echo ""
  exit 1
fi

echo -e "${GREEN}Coverage guard PASSED — all changed files meet the ${THRESHOLD}% branch threshold.${NC}"
echo ""
exit 0
