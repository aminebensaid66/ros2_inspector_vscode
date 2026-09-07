from setuptools import setup
setup(name='demo_pkg', version='0.1.0', packages=['demo_pkg'], entry_points={'console_scripts': ['talker = demo_pkg.talker:main']})
