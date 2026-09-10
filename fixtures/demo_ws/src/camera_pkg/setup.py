from setuptools import setup
setup(name='camera_pkg', version='0.2.0', packages=['camera_pkg'], entry_points={'console_scripts':['camera_node = camera_pkg.camera:main']})
