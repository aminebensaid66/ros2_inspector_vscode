# LinkedIn launch draft

I’ve been working on bringing **ROS2 Inspector directly into VS Code**.

The new extension turns the ROS 2 static architecture model into an editor-native workflow: explore packages, source nodes and launch deployments, inspect topics/services/actions, visualize the architecture interactively, surface unresolved evidence in Problems, and run architecture policy validation — without launching the ROS 2 system.

A few things I cared about while building it:

- the VS Code extension uses the same `ros2inspector` core as the CLI/CI workflow instead of reimplementing analysis logic;
- source definitions and launch deployments stay separate;
- unresolved names/types stay unresolved instead of being guessed;
- the graph is self-contained and makes no runtime web requests;
- analyzer execution is disabled for untrusted workspaces;
- the extension is designed for Linux, macOS, Windows, WSL, Remote SSH, Dev Containers and Codespaces.

The first release includes an Architecture Explorer, interactive Communications / Dependencies / Full graphs, source navigation, Problems integration, policy validation and cross-platform analyzer discovery.

Core analyzer: https://github.com/aminebensaid66/ros2_inspector
VS Code extension: https://github.com/aminebensaid66/ros2_inspector_vscode

Feedback from ROS 2 users is very welcome — especially on larger workspaces and unusual launch/package layouts.

#ROS2 #Robotics #VSCode #OpenSource #StaticAnalysis #DeveloperTools
