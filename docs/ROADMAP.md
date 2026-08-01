# Demand Research & Product Roadmap

Snapshot date: 2026-08-01. This roadmap separates observed demand from feature
ideas. Each minor line must remain a coherent, clearly user-visible workflow.

## Evidence

- The direct 0.4.0 request is fast inspection of node connectivity without
  leaving the editor or exposing netlists to an external service.
- Existing Marketplace adoption shows that compatibility and low setup cost
  matter, but adoption counts alone do not prove demand for any specific new
  feature.
- Comparable extensions expose useful demand signals:
  [vscode-spectre](https://marketplace.visualstudio.com/items?itemName=christian-parg.vscode-spectre)
  offers port-to-net inlay hints, semantic tokens, backslash continuations, and
  workspace symbols;
  [HSPICE IntelliSense](https://marketplace.visualstudio.com/items?itemName=vladimir-aptekar.hspice-intellisense)
  offers scoped statement search/navigation and configurable file behavior;
  [HSPICE Language Support](https://marketplace.visualstudio.com/items?itemName=MuhammadShofuwanAnwar.hspice-netlist)
  explores visual PULSE/SIN/PWL authoring.

Competitor presence is a discovery signal, not proof that this extension should
copy a feature. A candidate must also fit the core job: safely understanding
large HSPICE/Spectre netlists without schematics.

## Version policy

- `0.3.9`: release engineering, synchronization, parser correctness, tests, and
  documentation accumulated before the next capability release.
- `0.3.x` after `0.3.9`: security or correctness hotfixes only. Do not create a
  routine `0.3.10` feature bucket.
- `0.4.0+`: each minor version must deliver one coherent user workflow and have
  explicit acceptance evidence. Patch versions stabilize that workflow.
- `1.0.0`: only after the parser/provider interfaces, settings, release channels,
  and compatibility policy have remained stable across at least two minor lines.

## Proposed capability lines

### 0.4.0 — Scope-local connectivity inspection

Delivered scope:

- native Document Highlight, Peek References, Hover, F12, and clickable
  `formalPort:` Inlay Hints for a net in the current top level or current
  subcircuit;
- live-document-only `byLine` and `(scope, net)` indexes, including lightweight
  endpoints for filtered X/R/C/L statements;
- Spectre `\` end-of-line continuation with exact physical ranges;
- cancellation and visible-range bounding for Inlay Hints;
- generated HSPICE/Spectre regression and scale coverage.

Explicitly excluded: Workspace Symbol, cross-file top-level nets, recursive
hierarchy, global-net aggregation, a custom graph, Webview, or sidebar.

### 0.5.0 — Workspace-scale navigation candidate

- Workspace Symbol over the existing include graph;
- cancellable asynchronous scanning and bounded caches;
- configurable file extensions and dialect override;
- stronger cache invalidation than mtime alone.

Start only after two independent demand signals and a public generated fixture
show a recurring workspace-scale task. Keep the in-process architecture unless
reproducible synthetic benchmarks demonstrate that a worker is necessary.

### 0.6.0 — Root-aware connectivity candidate

- explicit root-netlist context;
- `.global` / `global` and ground handling across the root plus one hierarchy
  level;
- deterministic ambiguity handling before any recursive expansion.

Start only after two independent requests and a root-selection design that
cannot silently connect unrelated files. Full recursive connection graphs and
authoring assistance remain later candidates.

## Research loop

Before starting any minor line:

1. Triage Issues, PRs, Marketplace reviews/Q&A, and direct requests.
2. Record the user task, dialect, file scale, and current workaround without
   collecting proprietary netlist content.
3. Require two independent demand signals plus a reproducible generated fixture.
4. Publish the proposed acceptance tests in an Issue before implementation.
5. Re-rank this roadmap after each Marketplace/Open VSX release and after every
   five substantive user reports.

Private evaluation material, if used locally, is never uploaded. Public roadmap
evidence contains only an anonymous task conclusion and generated reproduction.
