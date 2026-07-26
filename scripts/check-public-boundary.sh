#!/usr/bin/env bash
set -euo pipefail

mode="${1:-current}"
if [[ "$mode" != "current" && "$mode" != "--history" ]]; then
  echo "usage: $0 [--history]" >&2
  exit 2
fi

forbidden_path_pattern='(^|/)(docs/(internal|private)/|docs/SYNC\.md$|docs/prompts-[^/]*\.md$)'
binary_review_pattern='\.(png|jpe?g|gif|webp|pdf|docx?|xlsx?|pptx?)$'
content_pattern='(/home/[^/[:space:]]+/|/Users/[^/[:space:]]+/|[A-Za-z]:\\Users\\|(^|[^0-9])(10\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}|192\.168\.[0-9]{1,3}\.[0-9]{1,3}|172\.(1[6-9]|2[0-9]|3[01])\.[0-9]{1,3}\.[0-9]{1,3})([^0-9]|$)|-----BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|[A-Z]{2,}-[0-9]{4,}-[A-Z0-9-]+|real(-world)?[[:space:]-]+[^.[:space:]]*[[:space:]-]+PDK|~[0-9]{3,}[[:space:]]+(models|symbols|sections|subckts))'

scan_tree() {
  local tree="$1"
  local paths
  local binaries
  local matches

  paths="$(git ls-tree -r --name-only "$tree" | grep -E "$forbidden_path_pattern" || true)"
  binaries="$(git ls-tree -r --name-only "$tree" |
    grep -Ei "$binary_review_pattern" |
    grep -Eiv '^icon\.(png|jpe?g)$' || true)"
  matches="$(git grep -n -I -E "$content_pattern" "$tree" -- \
    ':!package-lock.json' \
    ':!scripts/check-public-boundary.sh' 2>/dev/null |
    cut -d: -f2-3 |
    sort -u || true)"

  if [[ -n "$paths" || -n "$binaries" || -n "$matches" ]]; then
    echo "public-boundary violation in $tree" >&2
    [[ -z "$paths" ]] || printf 'forbidden paths:\n%s\n' "$paths" >&2
    [[ -z "$binaries" ]] || printf 'binary files requiring explicit review:\n%s\n' "$binaries" >&2
    [[ -z "$matches" ]] || printf 'sensitive content locations:\n%s\n' "$matches" >&2
    return 1
  fi
}

if [[ "$mode" == "--history" ]]; then
  while read -r commit; do
    scan_tree "$commit"
  done < <(git rev-list --all)
else
  scan_tree HEAD
fi

echo "public-boundary: PASS ($mode)"
