#!/usr/bin/env bash
set -euo pipefail

source_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d)"
trap 'rm -rf -- "$test_root"' EXIT

passed=0
pass() {
  passed=$((passed + 1))
  printf '  ok - %s\n' "$1"
}
fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

repo="$test_root/repo"
mkdir -p "$repo/scripts"
cp "$source_root/scripts/check-public-boundary.sh" "$repo/scripts/"
git -C "$repo" init -q
git -C "$repo" config user.name "Synthetic Tester"
git -C "$repo" config user.email "tester"@"example.invalid"
printf 'safe\n' > "$repo/README.md"
git -C "$repo" add README.md scripts/check-public-boundary.sh
git -C "$repo" commit -qm baseline
scanner="$repo/scripts/check-public-boundary.sh"

state_digest() {
  (
    cd "$repo"
    sha256sum .git/index
    git status --porcelain=v1 -z | sha256sum
  )
}

assert_no_temp_indexes() {
  if find "$repo/.git" -maxdepth 1 -name 'index.public-boundary.*' -print -quit | grep -q .; then
    fail "staged scan left a temporary index behind"
  fi
}

expect_staged_pass() {
  local before after
  before="$(state_digest)"
  "$scanner" --staged >/dev/null
  assert_no_temp_indexes
  after="$(state_digest)"
  [[ "$before" == "$after" ]] || fail "staged scan mutated index or worktree state"
}

expect_staged_fail() {
  local output="$test_root/failure-output.txt"
  if "$scanner" --staged >"$output" 2>&1; then
    fail "expected staged scan failure"
  fi
  assert_no_temp_indexes
}

printf 'safe with spaces\n' > "$repo/file with spaces.txt"
git -C "$repo" add "file with spaces.txt"
expect_staged_pass
pass "staged scan supports filenames with spaces and preserves state"
git -C "$repo" reset -q HEAD -- "file with spaces.txt"
rm -f -- "$repo/file with spaces.txt"

sensitive_path="/ho""me/synthetic/private"
printf '%s\n' "$sensitive_path" > "$repo/unstaged-only.txt"
expect_staged_pass
pass "unstaged-only content does not affect staged scan"
rm -f -- "$repo/unstaged-only.txt"

mkdir -p "$repo/docs/internal"
printf 'synthetic\n' > "$repo/docs/internal/note.txt"
git -C "$repo" add docs/internal/note.txt
expect_staged_fail
pass "staged forbidden path is rejected"
git -C "$repo" reset -q HEAD -- docs/internal/note.txt
rm -f -- "$repo/docs/internal/note.txt"
rmdir "$repo/docs/internal" "$repo/docs"

newline_path=$'docs/internal/line\nbreak.txt'
mkdir -p "$repo/docs/internal"
printf 'synthetic\n' > "$repo/$newline_path"
git -C "$repo" add "$newline_path"
expect_staged_fail
pass "staged forbidden paths are rejected with newline-safe traversal"
git -C "$repo" reset -q HEAD -- "$newline_path"
rm -f -- "$repo/$newline_path"
rmdir "$repo/docs/internal" "$repo/docs"

printf '%s\n' "$sensitive_path" > "$repo/location.txt"
git -C "$repo" add location.txt
expect_staged_fail
if grep -Fq "$sensitive_path" "$test_root/failure-output.txt"; then
  fail "scanner printed matched sensitive content"
fi
pass "staged sensitive text is rejected without echoing content"
git -C "$repo" reset -q HEAD -- location.txt
rm -f -- "$repo/location.txt"

printf 'synthetic\0binary\n' > "$repo/opaque-data"
git -C "$repo" add opaque-data
expect_staged_fail
pass "extensionless binary content is rejected"
git -C "$repo" reset -q HEAD -- opaque-data
rm -f -- "$repo/opaque-data"

printf 'plain text with archive suffix\n' > "$repo/bundle.zip"
git -C "$repo" add bundle.zip
expect_staged_fail
pass "review-required archive suffix is rejected"
git -C "$repo" reset -q HEAD -- bundle.zip
rm -f -- "$repo/bundle.zip"

printf '%s\n' "$sensitive_path" > "$repo/package-lock.json"
git -C "$repo" add package-lock.json
expect_staged_fail
pass "package lock content is scanned"
git -C "$repo" reset -q HEAD -- package-lock.json
rm -f -- "$repo/package-lock.json"

printf 'unreviewed icon\0\n' > "$repo/icon.png"
git -C "$repo" add icon.png
expect_staged_fail
pass "changed icon requires explicit hash review"
git -C "$repo" reset -q HEAD -- icon.png
rm -f -- "$repo/icon.png"

printf 'delete me\n' > "$repo/delete-me.txt"
git -C "$repo" add delete-me.txt
git -C "$repo" commit -qm "add deletion fixture"
git -C "$repo" rm -q delete-me.txt
expect_staged_pass
pass "staged deletion is scanned as the resulting tree"
git -C "$repo" restore --staged delete-me.txt
git -C "$repo" restore delete-me.txt

printf 'rename me\n' > "$repo/rename-me.txt"
git -C "$repo" add rename-me.txt
git -C "$repo" commit -qm "add rename fixture"
mkdir -p "$repo/docs/internal"
git -C "$repo" mv rename-me.txt docs/internal/renamed.txt
expect_staged_fail
pass "rename into a forbidden path is rejected"
git -C "$repo" mv docs/internal/renamed.txt rename-me.txt
rmdir "$repo/docs/internal" "$repo/docs"

if "$scanner" --unknown >/dev/null 2>&1 || "$scanner" --staged extra >/dev/null 2>&1; then
  fail "unknown arguments were accepted"
fi
pass "unknown and extra arguments are rejected"

git -C "$repo" checkout --detach -q
expect_staged_pass
pass "staged scan works from detached HEAD"

unborn="$test_root/unborn"
mkdir -p "$unborn/scripts"
cp "$source_root/scripts/check-public-boundary.sh" "$unborn/scripts/"
git -C "$unborn" init -q
printf 'safe\n' > "$unborn/safe.txt"
git -C "$unborn" add safe.txt scripts/check-public-boundary.sh
"$unborn/scripts/check-public-boundary.sh" --staged >/dev/null
pass "staged scan works before the first commit"

printf '\nAll %d public-boundary assertions passed.\n' "$passed"
