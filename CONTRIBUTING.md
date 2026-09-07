# Contributing

1. Fork and create a focused branch.
2. Run `npm run verify` before opening a pull request.
3. For UX changes, also launch an Extension Development Host with F5 and test with a real ROS 2 workspace.
4. Keep parsing/architecture semantics in the ROS2 Inspector Python project; this repository consumes its machine-readable UAM.
5. Do not add runtime network calls, telemetry, or CDN-hosted webview dependencies without an explicit architecture/security discussion.
