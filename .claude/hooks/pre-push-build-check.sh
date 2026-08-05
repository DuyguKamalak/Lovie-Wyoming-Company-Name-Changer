#!/usr/bin/env bash
# PreToolUse hook: before letting `git push` run, enforce CLAUDE.md's rule
# that `npm run build` must pass first. No-ops before the app is scaffolded
# (no package.json yet) and on any Bash command that isn't a git push.
set -euo pipefail

input="$(cat)"
command=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" <<< "$input" 2>/dev/null || echo "")

case "$command" in
  *"git push"*) ;;
  *) exit 0 ;;
esac

if [[ ! -f package.json ]]; then
  exit 0
fi

if ! npm run build --silent; then
  echo "npm run build failed — fix the build before pushing (see CLAUDE.md)." >&2
  exit 2
fi

exit 0
