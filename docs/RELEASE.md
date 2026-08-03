# Release & Build Guide

How to build, verify, and publish the SPICE extension without rebuilding or
publishing an artifact that was not reviewed.

## Prerequisites

- Node.js 24 for packaging with the pinned VSCE toolchain.
- Node.js 20 and 24 are both compile/test CI lanes.
- `npm ci` from the committed lockfile.
- Marketplace credentials only for the final, explicitly approved publish step.

The extension has zero runtime npm dependencies.
The repository `.npmrc` enforces Node engine compatibility and disables
dependency lifecycle scripts. Explicit project commands such as `npm run check`
and `npm run package:vsix` still run; do not approve third-party install scripts
for ordinary compilation or packaging.

## Build and test

```bash
npm ci
npm run check
```

`check` compiles TypeScript and runs the parser, connectivity, generated scale,
and public-boundary regression suites. `out/` is generated and git-ignored.

All committed fixtures and public evidence must be generated/synthetic HSPICE
or Spectre data. An optional private local canary may be run, but its source,
path, identity, logs, counts, timings, screenshots, and hashes must not enter
Git, CI, the VSIX, or public release evidence.

## Before commit

Stage only the reviewed source candidate, then run:

```bash
git diff --cached --check
scripts/check-public-boundary.sh --staged
npm ci
npm run check
```

The staged scan evaluates the complete Git index without creating a temporary
commit or changing index/worktree state. It rejects forbidden private paths,
sensitive text, unreviewed binary data, and an icon whose reviewed hash changed.

When changing versions, update package and lock metadata together:

```bash
npm version 0.4.0 --no-git-tag-version
```

Review lockfile changes separately; a version bump should not silently refresh
the dependency graph.

## Package and verify

```bash
npm run package:vsix
npm run package:contents
sha256sum spice-0.4.0.vsix
```

`package:vsix` runs the full checks, builds with pinned VSCE, and then inspects
the actual archive. The verifier enforces the exact reviewed runtime allowlist
and checks embedded `publisher`, `name`, `version`, and VS Code engine metadata.
Source, tests, scripts, docs, CI configuration, lockfiles, nested archives, and
dependency directories are not shipped.

Install the exact VSIX through `Extensions: Install from VSIX...` and verify on
synthetic HSPICE and Spectre samples:

- Outline and `.LIB` scope commands;
- F12, Hover, and Shift+F12 for existing symbols;
- net Highlight, net Peek References, and X-node F12;
- clickable `formalPort:` hints and `[spice]` hint disablement.

## Before push

```bash
git fetch --prune origin master
scripts/sync-preflight.sh local
scripts/check-public-boundary.sh
scripts/check-public-boundary.sh --history
npm ci
npm run check
npm run package:vsix
sha256sum spice-0.4.0.vsix
git status --short
```

Push, pull request, tag, GitHub Release, and Marketplace publication are separate
external writes. Each requires current maintainer approval; approval for an
earlier release does not carry forward.

## Tag, GitHub Release, and Marketplace

For the exact reviewed source commit:

1. Require all CI lanes and the single package job to pass.
2. Download the CI VSIX, checksum, and file list. Verify the checksum and archive
   contents locally without rebuilding.
3. After approval, create an annotated `v0.4.0` tag at that commit and attach the
   accepted VSIX/checksum to the GitHub Release.
4. After separate Marketplace approval and installation acceptance, publish the
   accepted archive itself:

   ```bash
   ./node_modules/.bin/vsce publish --packagePath spice-0.4.0.vsix
   ```

Use VSCE's interactive credential flow. Never place a Marketplace token in a
command line, URL, repository file, shell history example, or log.

Record the source commit, tag, CI run, artifact SHA-256, and published version as
one release identity. Do not rebuild between artifact review and publication.

## Rollback

Users can reinstall a previously accepted VSIX. Prefer a corrective patch over
unpublishing, because Marketplace unpublish is permanent for that version/name.
