# Analyzer contract — ros2inspector 0.1.3

The extension treats the released Python analyzer as the source of truth and does not reimplement ROS parsing or audit/policy semantics.

The compatibility baseline and minimum supported version is **ros2inspector 0.1.3**.

## Commands verified

The contract suite executes the real CLI with `shell: false` and validates:

```text
ros2inspector --version
ros2inspector --help
ros2inspector graph --help
ros2inspector nodes --help
ros2inspector audit --help
ros2inspector validate --help
ros2inspector --quiet graph full --format json -C fixtures/demo_ws
ros2inspector --quiet nodes --format json --show-connections -C fixtures/demo_ws
ros2inspector --quiet audit fixtures/demo_ws --format json
ros2inspector --quiet validate fixtures/demo_ws --policy fixtures/demo_ws/policy-pass.yaml --format json
ros2inspector --quiet validate fixtures/demo_ws --policy fixtures/demo_ws/policy-violate.yaml --format json
```

## Observed 0.1.3 schemas used by the extension

`graph full --format json` provides top-level arrays for `packages`, `nodes`, `deployments`, `interfaces`, `topics`, `services`, `actions`, `diagnostics`, a `summary` mapping, and `graph.nodes` / `graph.edges`.

`nodes --format json --show-connections` returns a node array. Each node may include `deployments` and `connections`; a connection includes `kind`, `name`, `role`, optional `deployment`, and the applicable `msg_type`, `srv_type`, or `action_type` plus peer lists.

`audit --format json` returns `summary` and `findings`. Findings expose `severity`, `rule_type`, `message`, `policy_file`, optional `policy_line`, and `affected_entities`.

`validate --format json` returns `summary` and `violations` with the same `PolicyViolation` fields.

## Exit behavior

- graph/nodes success: `0`
- audit: `0` when no finding meets the configured fail threshold, `1` when findings meet it; `1` is a valid findings result
- validate: `0` when no violation meets the configured fail threshold, `1` when violations meet it; `1` is a valid violations result
- invocation/workspace/policy failures use other non-zero codes and are treated as failures

## Important 0.1.3 quirk

In the released 0.1.3 full graph, some communication edges can have a source ID such as `static` that is not present in `graph.nodes`. The extension does not invent a node for it. Relationship normalization reconciles those communications with the analyzer's separate `nodes --show-connections` output and source endpoint evidence.

## Defensive compatibility

Unknown future fields are retained on entity data where safe. Missing arrays become empty arrays. Missing/duplicate graph IDs are normalized deterministically. Invalid or missing source line numbers fall back to line 1 only when a source file exists. Unsupported/missing fields are not fabricated.
