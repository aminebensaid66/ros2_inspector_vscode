from rclpy.node import Node
from interfaces_pkg.msg import Status
class BridgeNode(Node):
    def __init__(self):
        super().__init__('bridge_node')
        self.control_pub = self.create_publisher(Status, 'control', 10)
        self.objects_sub = self.create_subscription(Status, 'objects', lambda msg: None, 10)
def main():
    return BridgeNode()
