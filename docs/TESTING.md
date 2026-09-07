# Testing

## Fast verification

```bash
npm run verify
```

This syntax-checks all JavaScript and runs unit/contract tests using Node's built-in test runner. No npm installation is required.

## Package verification

```bash
npm run package
python - <<'PY'
import glob, zipfile
p=glob.glob('*.vsix')[0]
with zipfile.ZipFile(p) as z:
    assert 'extension.vsixmanifest' in z.namelist()
    assert 'extension/package.json' in z.namelist()
print(p, 'OK')
PY
```

## Real analyzer contract

```bash
python -m pip install "ros2inspector==0.1.3"
ros2inspector --quiet graph full --format json -C fixtures/demo_ws
```

GitHub CI runs this against the published ROS2 Inspector 0.1.3 package.

## Manual VS Code UI

Open the repository in VS Code, press F5, open `fixtures/demo_ws` in the Extension Development Host, and verify refresh, explorer expansion, graph modes/search, source navigation, policy validation, Problems diagnostics, workspace trust, and missing/outdated CLI error handling.
