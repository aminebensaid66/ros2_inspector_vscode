#!/usr/bin/env bash
set -euo pipefail
REPO="aminebensaid66/ros2_inspector_vscode"
if ! command -v gh >/dev/null; then echo "GitHub CLI (gh) is required." >&2; exit 1; fi
if [[ ! -d .git ]]; then git init -b main; fi
git add .
if ! git diff --cached --quiet; then git commit -m "feat: launch ROS2 Inspector for VS Code"; fi
if gh repo view "$REPO" >/dev/null 2>&1; then
  echo "$REPO already exists"
else
  gh repo create "$REPO" --public --description "ROS2 Inspector architecture exploration, diagnostics and policy checks inside VS Code." --source . --remote origin --push
fi
if ! git remote get-url origin >/dev/null 2>&1; then git remote add origin "https://github.com/$REPO.git"; fi
git push -u origin main
gh repo edit "$REPO" --homepage "https://github.com/aminebensaid66/ros2_inspector" --add-topic ros2 --add-topic robotics --add-topic vscode --add-topic static-analysis --add-topic architecture --add-topic developer-tools
