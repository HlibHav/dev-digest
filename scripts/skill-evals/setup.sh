#!/usr/bin/env bash
# Materialise one skill-eval fixture as a reviewable branch in its own worktree.
#
#   scripts/skill-evals/setup.sh <skill> <eval-name> [dest-dir]
#   scripts/skill-evals/setup.sh --teardown <skill> <eval-name> [dest-dir]
#
# Reads .claude/skills/<skill>/evals/evals.json, creates a worktree at the eval's
# base_commit, applies its fixture patch (if any) as one commit on the eval's branch, hides
# every skill's evals/ folder and the skill under test from the worktree (the
# answer key must not be greppable, and each arm gets its own copy of the skill by
# path, so none may find a different version in the tree), and installs the eval's `install` list
# (default server/ and reviewer-core/) for real (a symlinked node_modules changes resolved paths and
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
value = match[0].get(sys.argv[3])
if sys.argv[3] == "install":
    value = " ".join(value or ["server", "reviewer-core"])
print("" if value is None else value)
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
fixture="$(field fixture)"
message="$(field commit_message)"
read -r -a install <<< "$(field install)"

if git -C "$repo" show-ref --verify --quiet "refs/heads/$branch"; then
  echo "branch $branch already exists; run with --teardown first" >&2
  exit 1
fi

git -C "$repo" worktree add -q -b "$branch" "$dest" "$base"
# An eval without a fixture runs on the base tree itself (e.g. a whole-repo audit).
if [[ -n "$fixture" ]]; then
  git -C "$dest" apply --index "$evals_dir/$fixture"
  git -C "$dest" -c user.name="DevDigest Eval" -c user.email="eval@devdigest.local" \
    commit -q -m "$message"
fi

# Hide the answer keys and the skill under test without leaving a deletion in `git status`.
hidden=()
while IFS= read -r -d '' f; do hidden+=("$f"); done \
  < <(git -C "$dest" ls-files -z -- '.claude/skills/*/evals/*' ".claude/skills/$skill/*")
if [[ ${#hidden[@]} -gt 0 ]]; then
  git -C "$dest" update-index --skip-worktree -- "${hidden[@]}"
fi
rm -rf "$dest"/.claude/skills/*/evals "$dest/.claude/skills/$skill"

# Packages to install come from the eval's `install` list (default: server, reviewer-core).
for pkg in "${install[@]}"; do
  if [[ -f "$dest/$pkg/pnpm-lock.yaml" ]]; then
    (cd "$dest/$pkg" && pnpm install --frozen-lockfile --prefer-offline --silent)
  else
    (cd "$dest/$pkg" && npm ci --prefer-offline --no-audit --no-fund --silent)
  fi
done

echo "$dest"
