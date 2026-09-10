# Security

## Security boundary

ROS2 Inspector for VS Code is static-only. It never requires or connects to a running ROS graph, DDS/RMW, rosbridge, ROS daemon, or live topic data. It does not launch/build/source the workspace or execute workspace code.

- No telemetry and no runtime network requests.
- No source code or workspace metadata is uploaded.
- Analyzer execution is blocked until VS Code Workspace Trust is granted.
- Analyzer subprocesses use Node `spawn` with `shell: false`.
- Analyzer duration and captured stdout/stderr are bounded; active work can be cancelled/superseded.
- The installed analyzer must satisfy the configured minimum version (0.1.3 baseline).
- Graph and details webviews use restrictive CSPs, per-render nonces, no remote resources, and no workspace local-resource roots.
- Analyzer-controlled values are displayed through DOM `textContent` or script-context-safe JSON embedding.

Suggested `ros2 ...` commands are text-only clipboard suggestions. The extension never executes them.

## Reporting

Report security vulnerabilities privately to the maintainer. Include extension version, VS Code version, platform/remote environment, reproduction steps, and impact.
