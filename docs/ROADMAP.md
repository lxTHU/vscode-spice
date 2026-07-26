# Demand Research & Product Roadmap

Snapshot date: 2026-07-26. This roadmap separates observed demand from feature
ideas. Patch releases remain in `0.3.x`; `0.4.0` is reserved for the first
coherent, clearly user-visible capability cluster.

## Evidence

- The [VS Code Marketplace listing](https://marketplace.visualstudio.com/items?itemName=xuanli.spice)
  reports more than 50,000 installs. The public repository has 34 stars and 7
  forks at this snapshot, but no open Issues. Sparse Issues therefore are not
  sufficient evidence that users have no unmet needs.
- Historical requests include
  [Open VSX publication](https://github.com/lxTHU/vscode-spice/issues/7) and
  [`.lis` recognition](https://github.com/lxTHU/vscode-spice/issues/8).
  `.lis` is implemented. Open VSX was closed as not planned and should remain a
  distribution decision, not silently become a code feature.
- Three old pull requests remain open:
  [DSPF TODO](https://github.com/lxTHU/vscode-spice/pull/5),
  [subcircuit folding](https://github.com/lxTHU/vscode-spice/pull/6), and
  [subcircuit/function folding](https://github.com/lxTHU/vscode-spice/pull/9).
  They conflict with current `master`; file recognition and folding are already
  covered by newer implementations. Close them only after a maintainer review,
  with a pointer to the replacement behavior.
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

### 0.4.0 — Connectivity inspection

Candidate scope:

- port-to-net inlay hints for HSPICE and Spectre instances, default off for large
  files and configurable per workspace;
- Spectre `\` end-of-line continuation in the shared logical-line parser;
- workspace symbol search across the existing include graph;
- cancellation and a measured large-file latency budget for both providers.

Acceptance gate:

- validate on one multi-file HSPICE fixture and one multi-file Spectre fixture;
- no change to F12/Hover/References results with hints disabled;
- no synchronous provider operation above 200 ms on the redacted large-PDK
  benchmark;
- at least one external user report, Issue, or maintainer-approved real workflow
  confirming that inline connectivity or workspace search solves a recurring
  task.

### 0.5.0 — Large-netlist navigation workflow

Candidate scope:

- scoped search inside an instance statement, subcircuit header, or body;
- commands to jump to statement/body start and end;
- configurable file extensions and dialect override for non-standard PDK files;
- cache invalidation stronger than mtime-only, with bounded memory telemetry.

Start only after `0.4.x` usage shows repeated navigation friction that cannot be
solved by native VS Code search. Preserve the in-process architecture unless
benchmarks demonstrate that a worker or language server is necessary.

### 0.6.0 — Authoring assistance, conditional

Prototype snippets/completions and a PULSE/PWL editor only if direct user
requests show that netlist creation—not inspection—is a primary workflow.
Generated text must always be previewed before insertion and must not evaluate
vendor model data.

Running simulators, downloading binaries, parsing proprietary result formats,
or numerical corner evaluation are outside this line. Each requires a separate
security/data-handling design and stronger demand evidence.

## Research loop

Before starting any minor line:

1. Triage Issues, PRs, Marketplace reviews/Q&A, and internal redacted workflows.
2. Record the user task, dialect, file scale, and current workaround without
   collecting proprietary netlist content.
3. Require two independent demand signals plus a reproducible redacted fixture.
4. Publish the proposed acceptance tests in an Issue before implementation.
5. Re-rank this roadmap after each Marketplace/Open VSX release and after every
   five substantive user reports.
