import os
import sys
from pathlib import Path
import django

def configure_django():

    BASE_DIR = Path(__file__).resolve().parent
    sys.path.append(str(BASE_DIR))  # Add parent directory to path
    os.environ.setdefault("DJANGO_SETTINGS_MODULE","CHATBOT_V1.settings")  # Set the Django settings module
    django.setup() # Initialize Django
