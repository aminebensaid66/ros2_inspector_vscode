# Architecture

The VS Code extension is intentionally a presentation/integration layer over the ROS2 Inspector CLI.

`InspectorBackend` validates the installed CLI and executes `ros2inspector --quiet graph full --format json -C <workspace>` with `shell: false`. `model.js` normalizes the returned UAM without changing its semantics. The same model feeds the explorer, graph, diagnostics, source navigation, and summary.

The graph webview is dependency-free, CSP-restricted, has no network access, and renders a bounded deterministic layout. The bound prevents very large workspaces from freezing the editor; users can explicitly increase it.

Policy validation is a separate CLI call because ROS2 Inspector intentionally returns exit code 1 when policy violations meet `--fail-on`; this is treated as a valid result, not a process failure.
