from rclpy.node import Node
class IsolatedNode(Node):
    def __init__(self):
        super().__init__('isolated_node')
def main():
    return IsolatedNode()
