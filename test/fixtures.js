'use strict';

function sampleBundle() {
  const raw = {
    packages: [
      { name: 'demo', version: '0.2.0', package_type: 'ament_python', path: '/ws/src/demo', health_score: 88, dependencies: { exec: ['interfaces_pkg'] } },
      { name: 'interfaces_pkg', version: '0.1.0', package_type: 'ament_cmake', path: '/ws/src/interfaces_pkg', dependencies: {} }
    ],
    nodes: [
      { name: 'CameraNode', source_symbol: 'CameraNode', declared_ros_name: 'camera_node', package: 'demo', language: 'python', file_path: '/ws/src/demo/camera.py', line: 4, has_dynamic_names: true,
        publishers: [{ name: 'image', msg_type: 'interfaces_pkg/Status', file_path: '/ws/src/demo/camera.py', line: 8, evidence: 'create_publisher', confidence: 'high' }],
        subscriptions: [], services: [], clients: [], action_servers: [], action_clients: [] },
      { name: 'OtherNode', package: 'demo', language: 'python', file_path: '/ws/src/demo/other.py', line: 2, publishers: [], subscriptions: [], services: [], clients: [], action_servers: [], action_clients: [] }
    ],
    deployments: [
      { id: 'deployment:camera', kind: 'Deployment', name: '/robot/camera', package: 'demo', executable: 'camera_node', namespace: 'robot', launch_file: '/ws/src/demo/launch/demo.launch.py', source_node_id: 'node:demo/CameraNode', resolution: 'known', remaps: { image: 'image_raw' } }
    ],
    topics: [{ name: '/robot/image_raw', msg_type: 'interfaces_pkg/Status', publishers: ['/robot/camera'], subscribers: [] }],
    services: [{ name: '/robot/reset', srv_type: 'interfaces_pkg/Reset', providers: ['/robot/camera'], callers: ['/robot/client'] }],
    actions: [{ name: '/robot/navigate', action_type: 'interfaces_pkg/Navigate', servers: ['/robot/camera'], clients: ['/robot/client'] }],
    interfaces: [
      { name: 'Status', package: 'interfaces_pkg', kind: 'msg', file_path: '/ws/src/interfaces_pkg/msg/Status.msg', fields: ['string state'] },
      { name: 'Reset', package: 'interfaces_pkg', kind: 'srv', file_path: '/ws/src/interfaces_pkg/srv/Reset.srv', fields: [] },
      { name: 'Navigate', package: 'interfaces_pkg', kind: 'action', file_path: '/ws/src/interfaces_pkg/action/Navigate.action', fields: [] }
    ],
    diagnostics: [{ severity: 'warning', code: 'launch_branch_unresolved', message: 'dynamic launch', file: '/ws/src/demo/launch/demo.launch.py' }],
    summary: { packages: 2, nodes: 2, deployments: 1, topics: 1, services: 1, actions: 1, interfaces: 3 },
    graph: {
      nodes: [
        { id: 'pkg:demo', kind: 'Package', name: 'demo' }, { id: 'pkg:interfaces_pkg', kind: 'Package', name: 'interfaces_pkg' },
        { id: 'node:demo/CameraNode', kind: 'Node', name: 'CameraNode', package: 'demo', file_path: '/ws/src/demo/camera.py', line: 4 },
        { id: 'node:demo/OtherNode', kind: 'Node', name: 'OtherNode', package: 'demo', file_path: '/ws/src/demo/other.py', line: 2 },
        { id: 'deployment:camera', kind: 'Deployment', name: '/robot/camera', package: 'demo', source_node_id: 'node:demo/CameraNode', launch_file: '/ws/src/demo/launch/demo.launch.py' },
        { id: 'topic:/robot/image_raw', kind: 'Topic', name: '/robot/image_raw', msg_type: 'interfaces_pkg/Status' },
        { id: 'svc:/robot/reset', kind: 'Service', name: '/robot/reset', srv_type: 'interfaces_pkg/Reset' },
        { id: 'action:/robot/navigate', kind: 'Action', name: '/robot/navigate', action_type: 'interfaces_pkg/Navigate' },
        { id: 'iface:interfaces_pkg/Status', kind: 'Interface', name: 'Status', package: 'interfaces_pkg', iface_kind: 'msg' }
      ],
      edges: [
        { source: 'pkg:demo', target: 'pkg:interfaces_pkg', rel: 'depends_on' },
        { source: 'node:demo/CameraNode', target: 'deployment:camera', rel: 'deploys_as' },
        { source: 'static', target: 'topic:/robot/image_raw', rel: 'publishes', file_path: '/ws/src/demo/camera.py', line: 8, deployment_id: 'deployment:camera' },
        { source: 'node:demo/CameraNode', target: 'iface:interfaces_pkg/Status', rel: 'uses_interface' }
      ]
    }
  };
  const nodeConnections = [{
    name: 'CameraNode', source_symbol: 'CameraNode', declared_ros_name: 'camera_node', package: 'demo', language: 'python', file_path: '/ws/src/demo/camera.py', line: 4,
    deployments: raw.deployments,
    connections: [
      { kind: 'topic', name: '/robot/image_raw', role: 'publishes', deployment: '/robot/camera', msg_type: 'interfaces_pkg/Status' },
      { kind: 'service', name: '/robot/reset', role: 'provides', deployment: '/robot/camera', srv_type: 'interfaces_pkg/Reset' },
      { kind: 'action', name: '/robot/navigate', role: 'provides', deployment: '/robot/camera', action_type: 'interfaces_pkg/Navigate' }
    ]
  }];
  const audit = { summary: { total_findings: 2 }, findings: [
    { severity: 'info', rule_type: 'topic_connectivity', message: "Topic '/robot/image_raw' has no subscribers", policy_file: 'audit', affected_entities: ['/robot/image_raw'] },
    { severity: 'warning', rule_type: 'node_isolation', message: "Node 'OtherNode' has no detected communications", policy_file: 'audit', affected_entities: ['OtherNode'] }
  ] };
  const policy = { summary: { violations: { errors: 1, warnings: 0, info: 0 } }, violations: [
    { severity: 'error', rule_type: 'naming', message: "Node 'CameraNode' violates naming", policy_file: '/ws/policy.yaml', affected_entities: ['CameraNode'] }
  ] };
  return { raw, nodeConnections, audit, policy };
}

module.exports = { sampleBundle };
