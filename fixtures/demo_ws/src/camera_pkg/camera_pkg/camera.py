from rclpy.node import Node
from interfaces_pkg.msg import Status
from interfaces_pkg.srv import Reset
from interfaces_pkg.action import Navigate
from rclpy.action import ActionServer

class CameraNode(Node):
    def __init__(self):
        super().__init__('camera_node')
        self.image_pub = self.create_publisher(Status, 'image', 10)
        self.unused_pub = self.create_publisher(Status, 'unused_output', 10)
        self.control_sub = self.create_subscription(Status, 'control', lambda msg: None, 10)
        self.reset_srv = self.create_service(Reset, 'reset', lambda req, res: res)
        self.nav_server = ActionServer(self, Navigate, 'navigate', self.execute)
        dynamic_topic = self.get_parameter('dynamic_topic').value
        self.dynamic_pub = self.create_publisher(Status, dynamic_topic, 10)
    async def execute(self, goal):
        return Navigate.Result()

def main():
    return CameraNode()
