import rclpy
from rclpy.node import Node
from std_msgs.msg import String

class Talker(Node):
    def __init__(self):
        super().__init__('talker')
        self.publisher = self.create_publisher(String, '/demo/chatter', 10)

def main():
    rclpy.init()
    rclpy.spin(Talker())
