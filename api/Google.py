import os
from pathlib import Path
from django.conf import settings
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from app.models import GoogleDriveToken

# If modifying these scopes, delete the file token.json.
SCOPES = ["https://www.googleapis.com/auth/drive"]
CREDENTIALS_FILE = "credentials.json"  # Standard naming convention

def get_drive_service(user):
    """Authenticate and return Google Drive service"""
    creds = None

    try:
        token_model = GoogleDriveToken.objects.get(user=user)
        creds = token_model.to_credentials()
    except GoogleDriveToken.DoesNotExist:
        print("No Google Drive token found for user. Proceeding with OAuth flow.")
    
    # If there are no (valid) credentials available, let the user log in
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                CREDENTIALS_FILE, 
                SCOPES,
                prompt = 'consent'
            )
            # Use different port than Django (8000)
            creds = flow.run_local_server(port=0)  
        
        GoogleDriveToken.from_credentials(user,creds)
        
    return build("drive", "v3", credentials=creds)


def create_folder(user, folder_name, parent_id=None):
    service=get_drive_service(user)
    """Create a folder in Google Drive"""
    try:
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
        print(f"An error occurred: {error}")
        return None