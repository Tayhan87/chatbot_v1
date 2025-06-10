import os
import sys
import socket
from contextlib import closing
import webbrowser
from pathlib import Path
from django.conf import settings
from django.utils import timezone
from datetime import datetime
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# Configure Django
if not settings.configured:
    project_root = Path(__file__).resolve().parent.parent.parent
    sys.path.append(str(project_root))
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'chatbot_v1.settings')
    import django
    django.setup()

from app.models import GoogleDriveToken

def get_available_port(preferred_ports=[8080, 8081, 8082]):
    import socket
    for port in preferred_ports:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("localhost", port))
                return port
            except OSError:
                continue
    raise Exception("No available port found in preferred list")



PORT = get_available_port()



SCOPES = ["https://www.googleapis.com/auth/drive"]
# CREDENTIALS_FILE = os.path.join(os.path.dirname(__file__), "credentials.json")
CREDENTIALS_FILE = "credentials.json"

def parse_google_datetime(dt_str):
    """Parse Google's datetime string with or without 'Z' suffix"""
    try:
        return datetime.strptime(dt_str, "%Y-%m-%dT%H:%M:%S.%fZ")
    except ValueError:
        return datetime.strptime(dt_str, "%Y-%m-%dT%H:%M:%S.%f")








def get_drive_service(user):
    """Authenticate and return Google Drive service"""
    creds = None
    
    try:
        token_model = GoogleDriveToken.objects.get(user=user)
        creds = token_model.to_credentials()
    except GoogleDriveToken.DoesNotExist:
        print("No existing token found. Starting new OAuth flow.")

    # If credentials are not valid (non-existent, expired, or revoked)
    if not creds or not creds.valid:
        # If creds exist and are expired, try to refresh them
        if creds and creds.expired and creds.refresh_token:
            try:
                print("Credentials have expired. Attempting to refresh token.")
                creds.refresh(Request())
                # After a successful refresh, save the updated credentials
                GoogleDriveToken.from_credentials(user, creds)
                print("Token refreshed and saved successfully.")
            except Exception as refresh_error:
                print(f"Failed to refresh token: {refresh_error}. A new login is required.")
                creds = None # Force re-authentication

    # If there are no valid credentials after checking/refreshing, start the OAuth flow
    if not creds:
        print("No valid credentials available. Starting new OAuth flow.")
        try:
            flow = InstalledAppFlow.from_client_secrets_file(
                CREDENTIALS_FILE,
                scopes=SCOPES,
                redirect_uri='http://localhost:{PORT}/accounts/google/login/callback'
            )
            
            # Using port=0 lets the system find an available port automatically
            creds = flow.run_local_server(
                port=PORT, 
                success_message="Authentication complete! You can close this window.",
                #open_browser=True
            )
        except Exception as auth_error:
            print(f"❌ Authentication failed: {auth_error}")
            return None
        
        # Save the new credentials for the user
        try:
            GoogleDriveToken.from_credentials(user, creds)
            print("New credentials saved successfully.")
        except Exception as save_error:
            print(f"Failed to save new credentials: {save_error}")
            return None

    try:
        return build("drive", "v3", credentials=creds)
    except Exception as build_error:
        print(f"Failed to build Google Drive service: {build_error}")
        return None





def create_folder(user, folder_name, parent_id=None):
    """Create folder in user's Drive"""
    try:
        service = get_drive_service(user)
        metadata = {
            'name': folder_name,
            'mimeType': 'application/vnd.google-apps.folder'
        }
        if parent_id:
            metadata['parents'] = [parent_id]
            
        folder = service.files().create(
            body=metadata,
            fields='id'
        ).execute()
        return folder.get('id')
    except HttpError as error:
        print(f"Drive API Error: {error}")
        return None
    
    
def search_folder(user,folder_name):
    try:
        service=get_drive_service(user)
        query = f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false" 

        response = service.files().list(
            q=query,
            spaces='drive',
            fields='files(id,name)'
        ).execute()
        
        folders = response.get('files', [])

        if not folders:
            print(f"No folder found with name: {folder_name}")
            return False
        else:
            print(f"Found folder: {folders[0]['name']} with ID: {folders[0]['id']}")
            return True
    except HttpError as error:
        print(f"Drive API Error: {error}")
        return None