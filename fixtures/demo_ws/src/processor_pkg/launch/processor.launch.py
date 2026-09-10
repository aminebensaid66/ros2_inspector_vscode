from launch import LaunchDescription
from launch_ros.actions import Node

def generate_launch_description():
    return LaunchDescription([
        Node(package='processor_pkg', executable='processor_node', name='processor', namespace='robot'),
        Node(package='processor_pkg', executable='isolated_node', name='isolated', namespace='robot'),
    ])
