import sys
import os

# Add processor and alert-notifier directories to Python module search path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "processor")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "alert-notifier")))
