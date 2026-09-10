# Changelog

## 0.2.0

- Upgraded the Architecture Explorer from flat inventory lists to expandable relationship-aware entities.
- Added first-class entity details, audit findings, policy violations, source evidence, and reveal-in-graph navigation.
- Added deployment-aware topic/service/action relationships using the released 0.1.3 `nodes --show-connections` contract.
- Added robust model indexes, deterministic normalization, malformed/duplicate-ID handling, finding association and deduplication.
- Added graph zoom/pan/fit/reset, arrowheads, filters, keyboard selection, 1/2-hop focus, correct filtered truncation totals, and state preservation.
- Added cancellable generation-based refresh, stale-state reporting, analyzer timeout/output bounds, and cached version checks.
- Expanded the static fixture and real `ros2inspector==0.1.3` contract suite.
- Preserved zero npm runtime dependencies, Workspace Trust, CSP/self-contained webviews, no telemetry/network, and `shell: false` subprocess execution.

## 0.1.0

- Initial public VS Code extension with Architecture Explorer, graph, source navigation, Problems integration, policy validation, dependency-free VSIX packaging, and cross-platform CI.
