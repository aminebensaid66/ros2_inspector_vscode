# ROS2 Inspector VS Code 0.2.0 launch checklist

## Automated gates

- [ ] `npm run verify` passes.
- [ ] `python -m pip install "ros2inspector==0.1.3"`.
- [ ] `npm run test:contract` passes against the published 0.1.3 analyzer.
- [ ] `npm run package` produces `ros2-inspector-vscode-0.2.0.vsix`.
- [ ] `npm run validate:vsix` passes.
- [ ] CI is green on Linux, macOS and Windows.

## Manual VS Code acceptance

- [ ] Untrusted workspace never starts the analyzer.
- [ ] Missing/outdated analyzer has a clear error and Output details.
- [ ] Refresh populates relationship-aware packages/nodes/deployments/topics/services/actions/interfaces.
- [ ] Topic publisher/subscriber, service provider/client, action server/client and deployment/source links are correct.
- [ ] Entity Details navigation/copy actions work.
- [ ] Audit Findings and Policy Violations are grouped and searchable in the explorer.
- [ ] Source-located findings appear in Problems.
- [ ] Reveal in Architecture Graph works from explorer/details.
- [ ] Graph zoom in/out, wheel/trackpad zoom, drag pan, fit/reset, search, filters, arrowheads and edge details work.
- [ ] One-hop/two-hop focus and Escape-to-clear work.
- [ ] Graph truncation shows the selected filtered total and never leaves dangling edges.
- [ ] Rapid refresh/cancel cannot let an older result overwrite a newer result.
- [ ] Failed refresh marks retained results as stale.
- [ ] Refresh-on-save triggers only for relevant files inside the selected workspace.
- [ ] WSL / Remote SSH / Dev Container smoke test if those environments are part of launch support.

## Security/privacy

- [ ] No telemetry or runtime network request.
- [ ] No CDN/remote webview resources.
- [ ] All analyzer subprocesses use `shell: false`.
- [ ] No ROS runtime commands are executed.
- [ ] Suggested `ros2 ...` command actions only copy text.

## Marketplace/announcement

- [ ] Marketplace publisher ID matches `aminebensaid66` or `package.json` is corrected first.
- [ ] Install the exact release VSIX into a clean profile.
- [ ] README and screenshots match delivered behavior.
