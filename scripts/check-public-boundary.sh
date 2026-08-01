#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(git -C "$script_dir/.." rev-parse --show-toplevel)"
cd "$repo_root"

if [[ "$#" -gt 1 ]]; then
  echo "usage: $0 [--staged|--history]" >&2
  exit 2
fi
mode="${1:-current}"
if [[ "$mode" != "current" && "$mode" != "--staged" && "$mode" != "--history" ]]; then
  echo "usage: $0 [--staged|--history]" >&2
  exit 2
fi

forbidden_path_pattern='(^|/)(docs/(internal|private)/|docs/SYNC\.md$|docs/prompts-[^/]*\.md$)'
binary_review_pattern='\.(png|jpe?g|gif|webp|pdf|docx?|xlsx?|pptx?|zip|tar|tgz|gz|bz2|xz|7z|rar|vsix|db|sqlite[0-9]*|bin|exe|dll|so|dylib)$'
content_pattern='(/home/[^/[:space:]]+/|/Users/[^/[:space:]]+/|[A-Za-z]:\\Users\\|(^|[^0-9])(10\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}|192\.168\.[0-9]{1,3}\.[0-9]{1,3}|172\.(1[6-9]|2[0-9]|3[01])\.[0-9]{1,3}\.[0-9]{1,3})([^0-9]|$)|-----BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|[A-Z]{2,}-[0-9]{4,}-[A-Z0-9-]+|real(-world)?[[:space:]-]+[^.[:space:]]*[[:space:]-]+PDK|~[0-9]{3,}[[:space:]]+(models|symbols|sections|subckts))'

reviewed_binary_hash() {
  case "$1" in
    icon.png) printf '%s\n' '05cd242b20fd981e572903c14dced226759b75c77ba3bb0a26eda3d0992e8c33' ;;
    # Historical public logo retained only for full-history compatibility.
    icon.jpg) printf '%s\n' 'ecff1ee18f9ae85b2dac74fa12e214f2e7fd438dbcfd5cc0deb679ff54f9536d' ;;
  esac
}

scan_tree() {
  local tree="$1"
  local label="${2:-$tree}"
  local paths=""
  local binaries=""
  local matches
  local entry meta object file size digest reviewed_hash

  while IFS= read -r -d '' file; do
    if [[ "$file" =~ $forbidden_path_pattern ]]; then
      paths+="${paths:+$'\n'}$file"
    fi
  done < <(git ls-tree -r -z --name-only "$tree")
  while IFS= read -r -d '' entry; do
    meta="${entry%%$'\t'*}"
    file="${entry#*$'\t'}"
    object="${meta##* }"
    reviewed_hash="$(reviewed_binary_hash "$file")"
    if [[ -n "$reviewed_hash" ]]; then
      digest="$(git cat-file blob "$object" | sha256sum | cut -d' ' -f1)"
      if [[ "$digest" != "$reviewed_hash" ]]; then
        binaries+="${binaries:+$'\n'}$file (reviewed binary hash changed)"
      fi
      continue
    fi
    size="$(git cat-file -s "$object")"
    if [[ "$file" =~ $binary_review_pattern ]] ||
       { [[ "$size" -gt 0 ]] && ! git cat-file blob "$object" | LC_ALL=C grep -I . >/dev/null; }; then
      binaries+="${binaries:+$'\n'}$file"
    fi
  done < <(git ls-tree -r -z "$tree")
  matches="$(git grep -n -I -E "$content_pattern" "$tree" -- \
    ':!scripts/check-public-boundary.sh' 2>/dev/null |
    cut -d: -f2-3 |
    sort -u || true)"

  if [[ -n "$paths" || -n "$binaries" || -n "$matches" ]]; then
    echo "public-boundary violation in $label" >&2
    [[ -z "$paths" ]] || printf 'forbidden paths:\n%s\n' "$paths" >&2
    [[ -z "$binaries" ]] || printf 'binary files requiring explicit review:\n%s\n' "$binaries" >&2
    [[ -z "$matches" ]] || printf 'sensitive content locations:\n%s\n' "$matches" >&2
    return 1
  fi
}

staged_tree() (
  local index_path temp_index tree
  index_path="$(git rev-parse --git-path index)"
  temp_index="$(mktemp "${index_path}.public-boundary.XXXXXX")"
  trap 'rm -f -- "$temp_index"' EXIT HUP INT TERM
  cp -- "$index_path" "$temp_index"
  tree="$(GIT_INDEX_FILE="$temp_index" git write-tree)"
  printf '%s\n' "$tree"
)

if [[ "$mode" == "--history" ]]; then
  while read -r commit; do
    scan_tree "$commit"
  done < <(git rev-list --all)
elif [[ "$mode" == "--staged" ]]; then
  scan_tree "$(staged_tree)" "staged tree"
else
  scan_tree HEAD
fi

echo "public-boundary: PASS ($mode)"
