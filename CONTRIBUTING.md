# Contributing

1. Keep changes focused and preserve CommonJS/zero runtime npm dependencies unless a reviewed need requires otherwise.
2. Run `npm run verify`.
3. Install `ros2inspector==0.1.3` and run `npm run test:contract` when changing analyzer integration/model behavior.
4. Run `npm run package` and inspect/install the VSIX for UI changes.
5. Keep ROS parsing, architecture semantics, audits, and policy rules in the Python analyzer. The extension may normalize/reconcile only documented machine output.
6. Preserve Workspace Trust, `shell: false`, no telemetry/network/CDNs, CSP-restricted webviews, bounded processes/graphs, and static-only behavior.
