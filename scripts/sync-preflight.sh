#!/usr/bin/env bash
set -euo pipefail

usage() {
    echo "usage: $0 {equal|local|mirror} [--fetch]" >&2
    exit 64
}

mode="${1:-}"
fetch="${2:-}"
case "$mode" in
    equal|local|mirror) ;;
    *) usage ;;
esac
case "$fetch" in
    ""|--fetch) ;;
    *) usage ;;
esac

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"

if [ -n "$(git status --porcelain=v1 --untracked-files=normal)" ]; then
    echo "FAIL dirty_worktree=$repo_root" >&2
    exit 2
fi

branch=$(git branch --show-current)
if [ -z "$branch" ]; then
    echo "FAIL detached_head=$(git rev-parse HEAD)" >&2
    exit 3
fi

if [ "$fetch" = "--fetch" ]; then
    git fetch --prune origin master
fi

if ! git rev-parse --verify origin/master >/dev/null 2>&1; then
    echo "FAIL missing_ref=origin/master" >&2
    exit 4
fi

read -r ahead behind < <(git rev-list --left-right --count HEAD...origin/master)

case "$mode" in
    equal)
        [ "$ahead" -eq 0 ] && [ "$behind" -eq 0 ] || {
            echo "FAIL mode=equal ahead=$ahead behind=$behind" >&2
            exit 5
        }
        ;;
    local)
        [ "$behind" -eq 0 ] || {
            echo "FAIL mode=local ahead=$ahead behind=$behind" >&2
            exit 5
        }
        ;;
    mirror)
        [ "$ahead" -eq 0 ] || {
            echo "FAIL mode=mirror ahead=$ahead behind=$behind" >&2
            exit 5
        }
        ;;
esac

echo "OK mode=$mode branch=$branch ahead=$ahead behind=$behind head=$(git rev-parse HEAD)"
