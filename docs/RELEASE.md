# Release

1. Update `version` in `package.json` and `CHANGELOG.md`.
2. Run `npm run verify` and `npm run package` on at least one local platform.
3. Install the generated VSIX manually in stable VS Code and test a real workspace.
4. Push and require the GitHub CI matrix to be green on Linux, macOS and Windows.
5. Tag `v<version>`; `release.yml` packages and attaches the VSIX to the GitHub Release.
6. For Marketplace publication, ensure `package.json.publisher` exactly matches the Marketplace publisher ID. The generated VSIX is compatible with normal Marketplace tooling, or it can be repackaged/published with `@vscode/vsce` if preferred.
7. Verify installation from the released artifact before public announcement.
