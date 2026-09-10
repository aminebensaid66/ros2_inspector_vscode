# Release

1. Confirm `package.json` and `CHANGELOG.md` version.
2. Run `npm run verify`.
3. Install `ros2inspector==0.1.3` and run `npm run test:contract`.
4. Run `npm run package` and `npm run validate:vsix`.
5. Install the generated VSIX into a clean VS Code profile and complete `demo/LAUNCH_CHECKLIST.md`.
6. Require the Linux/macOS/Windows CI matrix and real analyzer contract to pass.
7. Verify the Marketplace publisher ID exactly matches `package.json#publisher` before publication.

Generated `.vsix` files are local/release artifacts and must not be committed.
