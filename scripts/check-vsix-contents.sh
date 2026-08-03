#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(git -C "$script_dir/.." rev-parse --show-toplevel)"
cd "$repo_root"

if [[ "$#" -gt 1 ]]; then
  echo "usage: $0 [path-to-vsix]" >&2
  exit 2
fi

version="$(node -p "require('./package.json').version")"
vsix="${1:-spice-${version}.vsix}"
[[ -f "$vsix" ]] || { echo "missing VSIX: $vsix" >&2; exit 1; }

expected_paths=(
  "[Content_Types].xml"
  "extension.vsixmanifest"
  "extension/LICENSE.txt"
  "extension/changelog.md"
  "extension/readme.md"
  "extension/icon.png"
  "extension/language-configuration.json"
  "extension/out/connectivity.js"
  "extension/out/extension.js"
  "extension/out/index.js"
  "extension/out/parser.js"
  "extension/package.json"
  "extension/snippets/snippets.json"
  "extension/snippets/snippets_meas.json"
  "extension/snippets/snippets_sources.json"
  "extension/snippets/snippets_spectre.json"
  "extension/syntaxes/SPICE.tmLanguage"
)

actual="$(unzip -Z1 "$vsix" | LC_ALL=C sort)"
expected="$(printf '%s\n' "${expected_paths[@]}" | LC_ALL=C sort)"
if [[ "$actual" != "$expected" ]]; then
  echo "VSIX contents differ from the reviewed runtime allowlist" >&2
  comm -23 <(printf '%s\n' "$actual") <(printf '%s\n' "$expected") | sed 's/^/unexpected: /' >&2
  comm -13 <(printf '%s\n' "$actual") <(printf '%s\n' "$expected") | sed 's/^/missing: /' >&2
  exit 1
fi

unzip -p "$vsix" extension/package.json |
  node -e '
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => { text += chunk; });
    process.stdin.on("end", () => {
      const pkg = JSON.parse(text);
      const expectedVersion = process.argv[1];
      if (pkg.publisher !== "xuanli" || pkg.name !== "spice" || pkg.version !== expectedVersion) {
        console.error("VSIX extension identity mismatch");
        process.exit(1);
      }
      if (pkg.engines?.vscode !== "^1.67.0") {
        console.error("VSIX VS Code engine mismatch");
        process.exit(1);
      }
    });
  ' "$version"

echo "VSIX contents: PASS ($vsix)"
