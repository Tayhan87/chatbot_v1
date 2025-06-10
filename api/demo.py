import os
import sys
from pathlib import Path
from django.conf import settings

# Get the correct project root path (adjust if needed)
project_root = Path(__file__).resolve().parent.parent
print(f"Project root: {project_root}")
 # Goes up two levels from api/
sys.path.append(str(project_root))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'chatbot_v1.settings')


import django
try:
    django.setup()
    print("Django setup successful")
except Exception as e:
    print(f"Error setting up Django: {e}")
    print(f"Python path: {sys.path}")
    print(f"Current directory: {os.getcwd()}")
    print("something went wrong, please check the settings and paths")
    raise

# Rest of your imports and code...
from api.Google import create_folder, search_folder
from app.models import Person

def manage_folder(email):
    print(f"Managing folder for user: {email}")
    try:
        user = Person.objects.get(email=email)
        folder_id = search_folder(user, "Test Folder")
        if folder_id:
            print(f"Found folder with ID: {folder_id}")
        else:
            print("Folder not found, creating new one...")
            folder_id = create_folder(user, "Test Folder")
            print(f"Created folder with ID: {folder_id}")
    except Person.DoesNotExist:
        print("User with this email doesn't exist")
    except Exception as e:
        print(f"An error occurred: {e}")

# if __name__ == "__main__":
#     email = "tayhanhossain87@gmail.com"
#     main(email)

