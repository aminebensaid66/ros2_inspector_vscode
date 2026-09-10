from setuptools import setup
setup(name='bridge_pkg', version='0.4.0', packages=['bridge_pkg'], entry_points={'console_scripts':['bridge_node = bridge_pkg.bridge:main']})
