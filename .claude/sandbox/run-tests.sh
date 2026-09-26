#!/bin/bash
# Run one test command inside Anthropic's sandbox-runtime (`srt`).
#
#   .claude/sandbox/run-tests.sh pnpm --dir server exec vitest run test/foo.test.ts
#
# Test files execute arbitrary code, so a Write/Edit path hook can't keep a test-writing agent
# inside its paths: a test could call fs.writeFileSync or child_process itself. This wrapper
# gives the test process an OS-level boundary instead. It may write only to a fresh temp dir,
# vitest's caches and vite's bundled-config temp files (see test-run.srt.json); it gets no
# network and no Unix sockets, so Docker is out of reach and *.it.test.ts files skip themselves.
#
# `agent-bash-allowlist.py` only lets the test-writer and plan-verifier run tests through this
# script. srt can't start inside another macOS sandbox, so in a session whose Bash tool is
# sandboxed the agent runs this one command outside the session sandbox — srt's own profile is
# the stricter of the two.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd -P)

# The checkout the command runs in: the parent of its `--dir` / `--prefix` package. The Bash
# allowlist has already pinned that to this repo or one of its git worktrees.
TARGET_ROOT=$ROOT
prev=""
for arg in "$@"; do
  if [ "$prev" = "--dir" ] || [ "$prev" = "--prefix" ]; then
    TARGET_ROOT=$(cd "$ROOT" && cd "$arg/.." && pwd -P)
    break
  fi
  prev=$arg
done

if ! command -v srt >/dev/null 2>&1; then
  echo "run-tests.sh: srt is not installed. Install it with: npm install -g @anthropic-ai/sandbox-runtime" >&2
  exit 127
fi

TMP=$(mktemp -d "${TMPDIR:-/tmp}/test-run.XXXXXX")
TMP=$(cd "$TMP" && pwd -P)
SETTINGS="$TMP.srt.json"
trap 'rm -rf "$TMP" "$SETTINGS"' EXIT

# vitest writes only its results cache (node_modules/.vite/vitest/results.json, data, not code).
# The rest of node_modules/.vite holds vite's dependency cache, which is code a later run outside
# the sandbox would load, so the sandbox may write only the vitest subdirectory. srt can't create
# that directory's parents, so it is created here, before the sandbox starts.
for pkg in server client reviewer-core; do
  if [ -d "$TARGET_ROOT/$pkg/node_modules" ]; then
    mkdir -p "$TARGET_ROOT/$pkg/node_modules/.vite/vitest"
  fi
done

sed -e "s#@ROOT@#$TARGET_ROOT#g" -e "s#@TMP@#$TMP#g" "$ROOT/.claude/sandbox/test-run.srt.json" > "$SETTINGS"

cd "$ROOT"
# srt sets the child's TMPDIR from CLAUDE_CODE_TMPDIR (then CLAUDE_TMPDIR, then /tmp/claude).
CLAUDE_CODE_TMPDIR="$TMP" CLAUDE_TMPDIR="$TMP" srt --settings "$SETTINGS" "$@"
