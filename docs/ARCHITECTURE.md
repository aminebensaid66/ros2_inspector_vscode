# Architecture

ROS2 Inspector for VS Code is a static presentation/integration layer over the released `ros2inspector` CLI.

```text
VS Code Extension Host
  ├─ InspectorBackend
  │    ├─ version gate (>=0.1.3)
  │    ├─ graph full JSON
  │    ├─ nodes --show-connections JSON
  │    ├─ audit JSON
  │    └─ validate JSON
  ├─ normalized investigation model
  │    ├─ canonical entities
  │    ├─ incoming/outgoing relationship indexes
  │    ├─ deployment/source reconciliation
  │    └─ diagnostics/audit/policy associations
  ├─ Architecture Explorer
  ├─ Entity Details webview
  ├─ Architecture Graph webview
  └─ VS Code Problems / Output / Status Bar
```

## Source of truth

The extension never parses Python, C++, launch, package, or ROS interface source itself. `ros2inspector` remains authoritative for static evidence, architecture semantics, audit checks, and policy rules. `model.js` only normalizes and indexes documented machine output and reconciles the analyzer's `graph full` and `nodes --show-connections` views.

## Relationship model

Canonical entities are created for packages, source nodes, deployments, topics, services, actions, and interfaces. Incoming/outgoing relationship indexes are shared by the explorer, details panel, graph, source navigation, and finding association so UI components do not duplicate relationship resolution.

Equivalent relationships are deduplicated deterministically. Actor-specific analyzer topic/service/action graph IDs are aggregated by static ROS name for investigation, while source nodes and launch deployments remain distinct entities.

## Process lifecycle

Every analyzer subprocess is spawned with `shell: false`, a timeout, an output-size bound, and optional cancellation. Refreshes use monotonically increasing generations. Starting a newer refresh aborts the older process and old results cannot overwrite newer ones. A failed refresh retains the last successful model only as an explicitly **stale** result.

Version checks are cached for an unchanged executable/minimum-version configuration and invalidated when those settings change.

## Webviews

Graph and Details are self-contained CSP-restricted webviews with no CDN, remote assets, or workspace local-resource roots. Analyzer-controlled values are represented with script-safe JSON and displayed through DOM `textContent`. The graph renderer is bounded and deterministic.

## Static-only boundary

No ROS runtime command is executed. The extension does not connect to DDS/RMW/rosbridge, invoke launch files, build/source a workspace, run workspace code, inspect a live graph, or send source/metadata over the network. Suggested ROS CLI commands are clipboard text only.
