#!/usr/bin/env bash
# Materialise one skill-eval fixture as a reviewable branch in its own worktree.
#
#   scripts/skill-evals/setup.sh <skill> <eval-name> [dest-dir]
#   scripts/skill-evals/setup.sh --teardown <skill> <eval-name> [dest-dir]
#
# Reads .claude/skills/<skill>/evals/evals.json, creates a worktree at the eval's
# base_commit, applies its fixture patch as one commit on the eval's branch, hides
# every skill's evals/ folder and the skill under test from the worktree (the
# answer key must not be greppable, and each arm gets its own copy of the skill by
# path, so none may find a different version in the tree), and installs server/ and reviewer-core/
# dependencies for real (a symlinked node_modules changes resolved paths and
# breaks the lint:boundaries baseline). Prints the worktree path.
set -euo pipefail

teardown=0
if [[ "${1:-}" == "--teardown" ]]; then teardown=1; shift; fi
if [[ $# -lt 2 ]]; then
  sed -n '2,13p' "$0" >&2
  exit 2
fi

skill="$1"
eval_name="$2"
repo="$(git rev-parse --show-toplevel)"
# Worktrees live in the main checkout's .claude/worktrees, even when run from a worktree.
main_root="$(cd "$(git rev-parse --git-common-dir)/.." && pwd)"
dest="${3:-$main_root/.claude/worktrees/skill-eval-$eval_name}"
evals_dir="$repo/.claude/skills/$skill/evals"
evals_json="$evals_dir/evals.json"
[[ -f "$evals_json" ]] || { echo "no $evals_json" >&2; exit 1; }

field() {
  python3 -I -c '
import json, sys
data = json.load(open(sys.argv[1]))
if sys.argv[3] == "base_commit":
    print(data["base_commit"]); sys.exit()
match = [e for e in data["evals"] if e["name"] == sys.argv[2]]
if not match: sys.exit(f"no eval named {sys.argv[2]}")
print(match[0][sys.argv[3]])
' "$evals_json" "$eval_name" "$1"
}

branch="$(field branch)"

if [[ $teardown -eq 1 ]]; then
  git -C "$repo" worktree remove --force "$dest" 2>/dev/null || true
  # macOS can recreate .DS_Store mid-removal and leave the directory behind.
  rm -rf "$dest"
  git -C "$repo" worktree prune
  git -C "$repo" branch -D "$branch" 2>/dev/null || true
  echo "removed $dest and $branch"
  exit 0
fi

base="$(field base_commit)"
patch="$evals_dir/$(field fixture)"
message="$(field commit_message)"

if git -C "$repo" show-ref --verify --quiet "refs/heads/$branch"; then
  echo "branch $branch already exists; run with --teardown first" >&2
  exit 1
fi

git -C "$repo" worktree add -q -b "$branch" "$dest" "$base"
git -C "$dest" apply --index "$patch"
git -C "$dest" -c user.name="DevDigest Eval" -c user.email="eval@devdigest.local" \
  commit -q -m "$message"

# Hide the answer keys and the skill under test without leaving a deletion in `git status`.
hidden=()
while IFS= read -r -d '' f; do hidden+=("$f"); done \
  < <(git -C "$dest" ls-files -z -- '.claude/skills/*/evals/*' ".claude/skills/$skill/*")
if [[ ${#hidden[@]} -gt 0 ]]; then
  git -C "$dest" update-index --skip-worktree -- "${hidden[@]}"
fi
rm -rf "$dest"/.claude/skills/*/evals "$dest/.claude/skills/$skill"

(cd "$dest/server" && pnpm install --frozen-lockfile --prefer-offline --silent)
(cd "$dest/reviewer-core" && npm ci --prefer-offline --no-audit --no-fund --silent)

echo "$dest"
