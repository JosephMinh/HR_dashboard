#!/usr/bin/env bash
# check-diff-coverage.sh
#
# Diff-aware per-file coverage guard.
#
# Checks that source files changed since the base branch meet a per-file
# line-coverage threshold.  Prevents new code from hiding behind aggregate
# legacy numbers: a project that is 63% covered overall can still introduce
# a completely untested file without this guard.
#
# Prerequisites:
#   Run `bun run test:coverage` before calling this script.
#   Optionally run `bun run test:integration:coverage` as well; the merged
#   report (coverage/merged-coverage-summary.json) is used when present.
#
# Usage (run from hr-dashboard/):
#   bash scripts/check-diff-coverage.sh
#   bash scripts/check-diff-coverage.sh --base origin/main
#   bash scripts/check-diff-coverage.sh --threshold 80
#   bash scripts/check-diff-coverage.sh --coverage-file coverage/coverage-summary.json
#   bash scripts/check-diff-coverage.sh --skip-uncovered
#
# Flags:
#   --base BRANCH        Git ref to diff against  (default: auto-detect main/origin/main)
#   --threshold PCT      Min line-coverage % required per file (default: 80)
#   --coverage-file FILE Explicit Istanbul coverage-summary.json path
#   --skip-uncovered     Warn (don't fail) when a changed file is absent from the report
#
# Coverage file search order (first found wins):
#   1. Explicit --coverage-file value
#   2. coverage/merged-coverage-summary.json  (unified unit+integration report)
#   3. coverage/coverage-summary.json         (unit-only fallback)
#
# Exit codes:
#   0  All changed source files meet the threshold (or none found)
#   1  One or more files below threshold or uncovered (without --skip-uncovered)
#   2  Invocation error (bad flag, missing dependency, no resolvable base branch)

set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

err()  { echo -e "${RED}✗ $*${NC}" >&2; }
ok()   { echo -e "${GREEN}✓ $*${NC}"; }
warn() { echo -e "${YELLOW}! $*${NC}"; }
info() { echo -e "${BLUE}  $*${NC}"; }

# ── Argument parsing ──────────────────────────────────────────────────────────
BASE=""
THRESHOLD=80
COVERAGE_FILE=""
SKIP_UNCOVERED=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)
      [[ -n "${2:-}" ]] || { err "--base requires an argument"; exit 2; }
      BASE="$2"; shift 2 ;;
    --threshold)
      [[ -n "${2:-}" ]] || { err "--threshold requires an argument"; exit 2; }
      THRESHOLD="$2"; shift 2 ;;
    --coverage-file)
      [[ -n "${2:-}" ]] || { err "--coverage-file requires an argument"; exit 2; }
      COVERAGE_FILE="$2"; shift 2 ;;
    --skip-uncovered)
      SKIP_UNCOVERED=1; shift ;;
    -h|--help)
      grep '^#' "$0" | head -40 | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      err "Unknown flag: $1"
      exit 2 ;;
  esac
done

# ── Resolve coverage file ─────────────────────────────────────────────────────
if [[ -z "$COVERAGE_FILE" ]]; then
  if   [[ -f "coverage/merged-coverage-summary.json" ]]; then
    COVERAGE_FILE="coverage/merged-coverage-summary.json"
  elif [[ -f "coverage/coverage-summary.json" ]]; then
    COVERAGE_FILE="coverage/coverage-summary.json"
  else
    err "No coverage file found."
    err "Run 'bun run test:coverage' first, or pass --coverage-file PATH."
    exit 1
  fi
fi

[[ -f "$COVERAGE_FILE" ]] || { err "Coverage file not found: $COVERAGE_FILE"; exit 1; }
info "Coverage file : $COVERAGE_FILE"
info "Threshold     : ${THRESHOLD}% line coverage"

# ── Resolve base branch ───────────────────────────────────────────────────────
if [[ -z "$BASE" ]]; then
  if   git rev-parse --verify main        >/dev/null 2>&1; then BASE="main"
  elif git rev-parse --verify origin/main >/dev/null 2>&1; then BASE="origin/main"
  else
    err "Cannot auto-detect base branch (tried 'main', 'origin/main')."
    err "Use --base BRANCH to specify one explicitly."
    exit 2
  fi
fi
info "Base branch   : $BASE"

# ── Run analysis via embedded Python ─────────────────────────────────────────
# All configuration is passed through environment variables so the heredoc
# can use single-quoting (no bash variable expansion inside Python source).
export DIFF_COV_FILE="$COVERAGE_FILE"
export DIFF_COV_BASE="$BASE"
export DIFF_COV_THRESHOLD="$THRESHOLD"
export DIFF_COV_SKIP_UNCOVERED="$SKIP_UNCOVERED"

python3 - <<'PY'
import json
import os
import subprocess
import sys

# ── Configuration from environment ───────────────────────────────────────────
coverage_file  = os.environ["DIFF_COV_FILE"]
base_ref       = os.environ["DIFF_COV_BASE"]
threshold      = float(os.environ["DIFF_COV_THRESHOLD"])
skip_uncovered = os.environ["DIFF_COV_SKIP_UNCOVERED"] == "1"

# ── ANSI colours ─────────────────────────────────────────────────────────────
RED    = "\033[0;31m"
GREEN  = "\033[0;32m"
YELLOW = "\033[0;33m"
NC     = "\033[0m"

# ── Locate git root ───────────────────────────────────────────────────────────
try:
    git_root = subprocess.check_output(
        ["git", "rev-parse", "--show-toplevel"], text=True, stderr=subprocess.DEVNULL
    ).strip()
except subprocess.CalledProcessError:
    print(f"{RED}✗ Not inside a git repository.{NC}", file=sys.stderr)
    sys.exit(2)

# ── Enumerate changed source files ────────────────────────────────────────────
def git_diff_names(spec_parts):
    """Return output of `git diff --name-only <spec_parts>` or None on error."""
    try:
        return subprocess.check_output(
            ["git", "diff", "--name-only"] + spec_parts,
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except subprocess.CalledProcessError:
        return None

# Prefer merge-base diff (triple-dot) to avoid noise from diverged histories.
# Fall back to two-dot diff if the triple-dot ref is not reachable.
raw = git_diff_names([f"{base_ref}...HEAD"])
if not raw:
    raw = git_diff_names([base_ref, "HEAD"])
if not raw:
    raw = ""

def is_source_file(path: str) -> bool:
    """True for .ts/.tsx files under a src/ directory (not .d.ts, not test files)."""
    if not (path.endswith(".ts") or path.endswith(".tsx")):
        return False
    if path.endswith(".d.ts"):
        return False
    # Must contain /src/ somewhere in the path, or start with src/
    if "/src/" not in path and not path.startswith("src/"):
        return False
    return True

changed = [p for p in raw.splitlines() if is_source_file(p.strip())]

if not changed:
    print(f"\n{GREEN}✓ No changed source files detected vs {base_ref!r}. Nothing to check.{NC}")
    sys.exit(0)

print(f"\nChanged source files ({len(changed)}):")
for f in changed:
    print(f"  {f}")

# ── Load coverage report ─────────────────────────────────────────────────────
with open(coverage_file, "r", encoding="utf-8") as fh:
    cov = json.load(fh)

# Build: absolute path → line coverage percentage
cov_map: dict[str, float] = {}
for key, data in cov.items():
    if key == "total":
        continue
    if isinstance(data, dict) and "lines" in data:
        cov_map[key] = float(data["lines"].get("pct", 0))

# ── Evaluate per-file coverage ────────────────────────────────────────────────
col_w = 72
print(f"\n{'FILE':<{col_w}}  {'LINES%':>7}  STATUS")
print(f"{'-' * col_w}  {'-' * 7}  ------")

failures: list[tuple[str, float, str]] = []

for rel_path in changed:
    abs_path = os.path.join(git_root, rel_path)

    if abs_path in cov_map:
        pct = cov_map[abs_path]
        if pct >= threshold:
            label = f"{GREEN}PASS{NC}"
        else:
            label = f"{RED}FAIL{NC}"
            failures.append((rel_path, pct, "below-threshold"))
        print(f"{rel_path:<{col_w}}  {pct:>6.1f}%  {label}")
    else:
        # File is not in the coverage report; it was never instrumented.
        if skip_uncovered:
            print(f"{YELLOW}{rel_path:<{col_w}}  {'n/a':>7}  SKIPPED (not in report){NC}")
        else:
            print(f"{RED}{rel_path:<{col_w}}  {'0.0':>6}%  UNCOVERED{NC}")
            failures.append((rel_path, 0.0, "uncovered"))

# ── Summary ───────────────────────────────────────────────────────────────────
print()

if not failures:
    print(
        f"{GREEN}✓ All {len(changed)} changed source file(s) meet the "
        f"{threshold:.0f}% line-coverage threshold.{NC}"
    )
    sys.exit(0)

print(
    f"{RED}✗ {len(failures)} file(s) failed the {threshold:.0f}% "
    f"line-coverage threshold:{NC}"
)
for path, pct, reason in failures:
    detail = f"{pct:.1f}%" if reason == "below-threshold" else "not in coverage report"
    print(f"  {RED}• {path}  ({detail}){NC}")

print()
print("Remediation:")
print("  • Add or extend tests that exercise the changed code paths.")
if not skip_uncovered:
    print(
        "  • Pass --skip-uncovered to warn instead of failing for files "
        "absent from the report."
    )
print(
    "  • Lower --threshold (discouraged; prefer raising coverage instead)."
)
sys.exit(1)
PY
