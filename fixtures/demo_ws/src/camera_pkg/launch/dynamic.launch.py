from launch import LaunchDescription
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node

def generate_launch_description():
    return LaunchDescription([Node(package='camera_pkg', executable='camera_node', name=LaunchConfiguration('camera_name'), namespace='dynamic_ns')])
