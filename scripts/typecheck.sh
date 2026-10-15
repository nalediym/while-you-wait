#!/usr/bin/env bash
# Type-checks the mod against this machine's Claude Code plugin API.
# The engine lays its declarations in .claude-plugin/types/ whenever it loads
# the mod from a watched folder; this script does the same by hand so `tsc`
# works anywhere. Point CLAUDE_CODE_DTS at a claude-code.d.ts to override.
set -euo pipefail
cd "$(dirname "$0")/.."
dts="${CLAUDE_CODE_DTS:-}"
if [ -z "$dts" ]; then
  dts=$(ls -t /private/tmp/claude-*/bundled-skills/*/*/plugin-authoring/types/claude-code.d.ts /tmp/claude-*/bundled-skills/*/*/plugin-authoring/types/claude-code.d.ts 2>/dev/null | head -1 || true)
fi
if [ -n "$dts" ] && [ -f "$dts" ]; then
  mkdir -p .claude-plugin/types/claude-code
  /bin/cp "$dts" .claude-plugin/types/claude-code/index.d.ts
elif [ ! -f .claude-plugin/types/claude-code/index.d.ts ]; then
  echo "No claude-code.d.ts found. Load the plugin-authoring skill in Claude Code once, or set CLAUDE_CODE_DTS." >&2
  exit 1
fi
echo "types: $(head -1 .claude-plugin/types/claude-code/index.d.ts)"
bunx --bun -p typescript@5.6.3 tsc -p .
echo "tsc: clean"
