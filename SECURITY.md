# Security

## Supported versions

Security fixes are applied to the latest released extension version.

## Security model

- No telemetry or runtime network requests.
- The analyzer is executed with Node `spawn(..., { shell: false })`.
- Analysis is blocked in untrusted VS Code workspaces.
- The architecture webview uses a restrictive Content Security Policy and a per-render nonce.
- Analyzer/source metadata is rendered through DOM `textContent`; JSON embedded in the webview is escaped for HTML script contexts.
- The webview is not granted access to local workspace files.

## Reporting

Please report vulnerabilities privately to the maintainer rather than opening a public exploit report. Include extension version, VS Code version, operating system, reproduction steps, and impact.
