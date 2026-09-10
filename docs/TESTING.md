# Testing

## Unit and security verification

```bash
npm run verify
```

This syntax-checks source/scripts/tests and runs Node's built-in test suite. Coverage includes analyzer command construction, version enforcement, timeout/cancellation/output limits, malformed external data, relationship indexes/selectors, finding association/deduplication, expandable explorer groups, refresh generation ordering, graph filtering/truncation/state, CSP/no-remote-resource rules, and manifest contributions.

No `npm install` is needed for the runtime or unit suite.

## Real analyzer contract

Install exactly the release baseline, then run:

```bash
python -m pip install "ros2inspector==0.1.3"
npm run test:contract
```

The fixture has four packages, multiple source nodes/deployments, pub/sub, a service provider/client, action server/client, `.msg`/`.srv`/`.action`, namespaces/remaps, an isolated node, unmatched endpoints, dynamic launch evidence, and passing/violating policies.

See `docs/ANALYZER_CONTRACT.md` for the verified commands and observed JSON contract.

## VSIX

```bash
npm run package
npm run validate:vsix
```

The dependency-free packager creates `ros2-inspector-vscode-0.2.0.vsix`. Validation checks required runtime modules and confirms tests, fixtures, and packaging scripts are not shipped.

## Manual VS Code acceptance

Open the repository in VS Code and press F5. In the Extension Development Host open `fixtures/demo_ws` and verify:

- Workspace Trust prevents analysis until trust is granted.
- Refresh exposes packages, source nodes, deployments, communications and interfaces.
- Expand entities and navigate through relationships.
- Show Details, Open Source, Reveal in Graph, and copy actions.
- Run Architecture Audit and Validate Policy; source-located findings reach Problems.
- Graph zoom, wheel/trackpad zoom, pan, fit/reset, filters, edge details, keyboard selection and 1/2-hop focus.
- Start two refreshes quickly; older results must not overwrite the newest generation.
- Force an analyzer error; previous data must be visibly labeled stale.
- Change only graph max nodes; the graph updates without re-running analysis.
- Save an irrelevant file or a relevant file outside the selected workspace; no refresh should occur.
