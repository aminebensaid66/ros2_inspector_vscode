from setuptools import setup
setup(name='processor_pkg', version='0.3.0', packages=['processor_pkg'], entry_points={'console_scripts':['processor_node = processor_pkg.processor:main','isolated_node = processor_pkg.isolated:main']})
