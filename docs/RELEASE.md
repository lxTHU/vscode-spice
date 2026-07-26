# Release & Build Guide

How to build, verify, and publish the SPICE extension. Follow this end-to-end
before tagging a release.

## Prerequisites

- Node.js (for `tsc` / `vsce`)
- Run `npm ci` from the committed lockfile (installs the pinned release toolchain)
- A Marketplace PAT only for the **publish** step (see [Publish](#publish) below).

## Build

```bash
npm ci                 # clean, reproducible dependency install
npm run check          # compile + parser assertions
```

`npm run compile` remains available for compile-only work. The compiled `out/`
directory is **git-ignored** (see `.gitignore`) and is
rebuilt by the `vscode:prepublish` script automatically. Never commit `out/`.

- `npm run watch` — incremental recompile during development.

## Verify before release

1. **Automated gate**: `npm run check` exits 0 with no TS or parser-test
   failures.
2. **Smoke-test the parser** (no VS Code needed) against a real PDK if available:
   ```bash
   node -e 'const {parseFile}=require("./out/parser.js"); const fs=require("fs"); \
     const m=parseFile("x.l", fs.readFileSync("PATH_TO_PDK","utf-8")); \
     console.log({subckt:m.subcktDefs.size, model:m.modelDefs.size, \
       section:m.sectionDefs.size, libRef:m.libRefs.length, param:m.paramDefs.size, \
       inc:m.includes.length});'
   ```
   Expect: `section` ≈ number of `.endl`, `libRef` = real `.lib 'file' sec`
   references, `inc` = `.include`/`.inc` only (no section-name pollution).
3. **Package**: see [Package](#package) below — produces a VSIX.
4. **Install locally** and exercise: Outline hierarchy, F12 on a model name /
   expression variable, Hover, Shift+F12, `SPICE: Select Active .LIB Section`.

## Package

```bash
npm run package:vsix
npm run package:contents
sha256sum spice-*.vsix
```

Produces `spice-<version>.vsix`. `--no-dependencies` is correct: the extension
has **zero runtime npm dependencies** (only dev `@types/*` + `typescript`).
VSCE is a pinned dev dependency; packaging never downloads an unreviewed
`@latest` tool.

The VSIX contents are governed by `.vscodeignore`:
- **Shipped**: compiled extension runtime, language configuration, grammar,
  snippets, package metadata, and required Marketplace metadata.
- **Excluded**: source/build inputs, tests, developer-only docs, dependency
  directories, synchronization/release-evidence scripts, TypeScript sources,
  and generated VSIX archives.

To install a local VSIX for manual testing:
`Extensions: Install from VSIX...` in VS Code, pick the file.

## Publish

> Publishing requires a **Marketplace Personal Access Token (PAT)**. The PAT is
> a secret — never put it in a file, commit it, or pass it on a command line
> where it is logged. Use the interactive prompt or `VSCE_PAT` in a transient
> environment variable that is not persisted.

1. Bump `version` in `package.json` (semver). Update `CHANGELOG.md` with a
   matching `## [<version>] - <date>` section.
2. Commit and push to `master` (the Marketplace README/CHANGELOG render from the
   repo pointed to by `package.json` `repository.url`).
3. Publish (interactive — it will ask for the PAT):
   ```bash
   npx @vscode/vsce publish <version>
   ```
   Or, with a transient PAT (set it just for this command in your shell):
   ```bash
   VSCE_PAT=<your-pat> npx @vscode/vsce publish <version>
   ```

**Creating the PAT** (one-time / per expiry): sign in at
https://dev.azure.com, the organization tied to the `xuanli` publisher →
*User settings → Personal access tokens → New Token* → Scopes: **Marketplace →
Manage**. Treat it like a password; it is not stored in this repo.

## Versioning conventions

- `0.3.x` — netlist navigation engine (in-process; HSPICE first, Spectre from
  0.3.5).
- Bump **patch** for fixes/minor doc changes; **minor** for new navigation
  features (new definition kinds, providers); review `engines.vscode` bumps in
  `CHANGELOG` as they raise the minimum supported VS Code.

## Rollback

The Marketplace keeps previous versions; users can install an older VSIX via
*Install from VSIX*. To yank a broken release, use the Marketplace management
portal (unpublish is permanent for that version/name — prefer releasing a fix
instead).

Source synchronization and WT fast-forward procedures are documented in
[SYNC.md](SYNC.md). GitHub is authoritative; generated dependencies and build
outputs are rebuilt, never copied between machines.
