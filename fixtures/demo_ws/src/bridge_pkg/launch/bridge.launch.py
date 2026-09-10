from launch import LaunchDescription
from launch_ros.actions import Node

def generate_launch_description():
    return LaunchDescription([
        Node(package='bridge_pkg', executable='bridge_node', name='bridge', namespace='robot'),
        Node(package='bridge_pkg', executable='bridge_node', name='bridge_sim', namespace='simulation', remappings=[('control','control_sim')]),
    ])
