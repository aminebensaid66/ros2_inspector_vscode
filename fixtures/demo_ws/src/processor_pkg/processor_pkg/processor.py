from rclpy.node import Node
from rclpy.action import ActionClient
from interfaces_pkg.msg import Status
from interfaces_pkg.srv import Reset
from interfaces_pkg.action import Navigate

class ProcessorNode(Node):
    def __init__(self):
        super().__init__('processor_node')
        self.image_sub = self.create_subscription(Status, 'image', lambda msg: None, 10)
        self.missing_sub = self.create_subscription(Status, 'missing_input', lambda msg: None, 10)
        self.objects_pub = self.create_publisher(Status, 'objects', 10)
        self.reset_client = self.create_client(Reset, 'reset')
        self.nav_client = ActionClient(self, Navigate, 'navigate')

def main():
    return ProcessorNode()
