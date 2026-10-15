#!/usr/bin/env bash
# Every check a change should pass, in one go. CI runs this too, with
# SKIP_TYPECHECK=1 (the plugin API's types only exist on a machine that runs
# Claude Code's plugin-authoring skill; see scripts/typecheck.sh).
#   ./scripts/check.sh
set -euo pipefail
cd "$(dirname "$0")/.."
step() { printf '\n▸ %s\n' "$*"; }

step 'version: plugin.json and BUILD in hooks/register.tsx agree'
manifest=$(bun -e 'console.log(require("./.claude-plugin/plugin.json").version)')
build=$(sed -n "s/^export const BUILD = '\([^']*\)'.*/\1/p" hooks/register.tsx)
if [ "$manifest" != "$build" ]; then
  echo "plugin.json says $manifest but BUILD says ${build:-nothing}" >&2
  exit 1
fi
echo "ok: $manifest"

# Quiet on success, everything on failure.
run() {
  local out
  if ! out=$("$@" 2>&1); then
    echo "$out"
    exit 1
  fi
  echo "$out" | tail -"${TAIL:-1}"
}

step 'claude plugin validate'
run claude plugin validate .

step 'claude plugin test'
TAIL=3 run claude plugin test .

step 'crosswords: every puzzle valid, puzzles.ts up to date'
bun scripts/check-crosswords.ts | tail -1
bun scripts/build-puzzles.ts --check

if [ -z "${SKIP_TYPECHECK:-}" ]; then
  step 'typecheck'
  ./scripts/typecheck.sh
fi

printf '\n✓ all checks passed\n'
