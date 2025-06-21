# You can place this in a utils.py file in your app, or directly in views.py
from allauth.socialaccount.models import SocialToken,SocialAccount
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from google.auth.transport.requests import Request
from django.conf import settings # To get your client_id and secret
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload, MediaIoBaseUpload
import mimetypes
import os
import io

from app.models import Person


def get_drive_service(user):
    """
    This is the CORRECT way to get Google API credentials in a Django application
    using the django-allauth library.
    """
    try:
        # 1. Get the token from the database for the logged-in user
        social_account = SocialAccount.objects.get(user=user, provider='google')
        if not social_account:
            print(f"No Google account found for user {user.email}. They may need to log in and authorize.")
            return None
        social_token = SocialToken.objects.get(account=social_account)
 

        # 2. Get your app's client ID and secret from settings
        #    You configure these in the Django Admin under "Social Applications"
        app = social_token.app
        client_id = app.client_id
        client_secret = app.secret

        # 3. Build the Credentials object
        creds = Credentials(
            token=social_token.token,
            refresh_token=social_token.token_secret, # allauth stores the refresh_token in token_secret
            token_uri='https://oauth2.googleapis.com/token',
            client_id=client_id,
            client_secret=client_secret,
            scopes=settings.SOCIALACCOUNT_PROVIDERS['google']['SCOPE'] # Use scopes from settings
        )

        # 4. If the token is expired, refresh it and save the new token
        if creds.expired and creds.refresh_token:
            print("Credentials have expired. Attempting to refresh token.")
            creds.refresh(Request())
            
            # Update the token in the database after refreshing
            social_token.token = creds.token
            # Note: The refresh token itself usually doesn't change, but it's good practice
            # in case a new one is issued.
            social_token.token_secret = creds.refresh_token 
            social_token.expires_at = creds.expiry
            social_token.save()
            print("Token refreshed and saved successfully.")

        # 5. Build and return the Drive service object
        return build("drive", "v3", credentials=creds)

    except SocialToken.DoesNotExist:
        print(f"No Google token found for user {user.email}. They may need to log in and authorize.")
        # You might want to redirect the user to the login page here
        return None
    except Exception as e:
        print(f"An unexpected error occurred while building Drive service: {e}")
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
            return folders[0]
    except HttpError as error:
        print(f"Drive API Error: {error}")
        return None
    



def create_folder(user, folder_name, parent_id=None):
    """Create folder in user's Drive"""
    try:
        service = get_drive_service(user)

        if not service:
            print("Google Drive service could not be initialized.")
            return None  # Prevents further code from breaking
        
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
    


def list_of_folders(email):
    try:

        user = Person.objects.get(email=email)
        service= get_drive_service(user)

        folder = search_folder(user, "Mercy Of Allah")

        if not folder:
            print("No folder found to list subfolders.")
            return []
        parent_folder_id = folder['id']
        query = (
            f"mimeType= 'application/vnd.google-apps.folder' and"
            f"'{parent_folder_id}' in parents and "
            "trashed=false"
        )

        response =  service.files().list(
            q=query,
            pageSize=10,
            fields="nextPageToken, files(id,name)"
        ).execute()

        return response.get('files', [])
    
    except HttpError as error:
        print(f"Google Api error: {error}")
        return []
    except Exception as e:
        print(f"An unexpected error occurred while listing folders: {e}")
        return []





def manage_folder(email):
    print(f"Managing folder for user: {email}")
    try:
        user = Person.objects.get(email=email)
        
        # Get the drive service
        service = get_drive_service(user)

        # --- ADD THIS CHECK ---
        # If the service is None, it means the user has no Google token.
        if not service:
            print(f"Cannot manage folder because user {email} has not authenticated with Google.")
            return # Stop execution to prevent a crash
        # --- END OF CHECK ---

        folder_exists = search_folder(user, "Mercy Of Allah")
        if folder_exists:
            print(f"Found folder for user: {email}")

        else:
            print("Folder not found, creating new one...")
            folder_id = create_folder(user, "Mercy Of Allah")
            if folder_id:
                print(f"Created folder with ID: {folder_id}")

    except Person.DoesNotExist:
        print("User with this email doesn't exist")
    except Exception as e:
        print(f"An unexpected error occurred in manage_folder: {e}")

def get_mime_type(filename):
    """Get MIME type for a file based on its extension"""
    mime_type, _ = mimetypes.guess_type(filename)
    if mime_type is None:
        # Default to binary if we can't determine the type
        mime_type = 'application/octet-stream'
    return mime_type

def upload_file_to_drive(user, file_path, folder_id, filename=None):
    """
    Upload a file to a specific Google Drive folder
    
    Args:
        user: Django user object
        file_path: Path to the file to upload
        folder_id: ID of the Google Drive folder to upload to
        filename: Optional custom filename (if None, uses original filename)
    
    Returns:
        Dictionary with file info if successful, None otherwise
    """
    try:
        service = get_drive_service(user)
        if not service:
            print("Google Drive service could not be initialized.")
            return None

        # Use original filename if not specified
        if filename is None:
            filename = os.path.basename(file_path)

        # Get MIME type
        mime_type = get_mime_type(filename)

        # File metadata
        file_metadata = {
            'name': filename,
            'parents': [folder_id]
        }

        # Create media upload object
        media = MediaFileUpload(file_path, mimetype=mime_type, resumable=True)

        # Upload the file
        file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id,name,webViewLink,size,createdTime'
        ).execute()

        print(f"File uploaded successfully: {file.get('name')} (ID: {file.get('id')})")
        return {
            'id': file.get('id'),
            'name': file.get('name'),
            'webViewLink': file.get('webViewLink'),
            'size': file.get('size'),
            'createdTime': file.get('createdTime')
        }

    except HttpError as error:
        print(f"Google Drive API error: {error}")
        return None
    except Exception as e:
        print(f"Unexpected error uploading file: {e}")
        return None

def upload_file_from_memory(user, file_content, filename, folder_id, mime_type=None):
    """
    Upload a file from memory (for uploaded files from web forms)
    
    Args:
        user: Django user object
        file_content: File content as bytes
        filename: Name of the file
        folder_id: ID of the Google Drive folder to upload to
        mime_type: MIME type of the file (if None, will be guessed)
    
    Returns:
        Dictionary with file info if successful, None otherwise
    """
    try:
        service = get_drive_service(user)
        if not service:
            print("Google Drive service could not be initialized.")
            return None

        # Get MIME type if not provided
        if mime_type is None:
            mime_type = get_mime_type(filename)

        # File metadata
        file_metadata = {
            'name': filename,
            'parents': [folder_id]
        }

        # Create file-like object from content
        file_stream = io.BytesIO(file_content)
        
        # Create media upload object
        media = MediaIoBaseUpload(file_stream, mimetype=mime_type, resumable=True)

        # Upload the file
        file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id,name,webViewLink,size,createdTime'
        ).execute()

        print(f"File uploaded successfully: {file.get('name')} (ID: {file.get('id')})")
        return {
            'id': file.get('id'),
            'name': file.get('name'),
            'webViewLink': file.get('webViewLink'),
            'size': file.get('size'),
            'createdTime': file.get('createdTime')
        }

    except HttpError as error:
        print(f"Google Drive API error: {error}")
        return None
    except Exception as e:
        print(f"Unexpected error uploading file: {e}")
        return None

def get_folder_by_name(user, folder_name, parent_folder_id=None):
    """
    Get a folder by name, optionally within a parent folder
    
    Args:
        user: Django user object
        folder_name: Name of the folder to find
        parent_folder_id: Optional parent folder ID to search within
    
    Returns:
        Folder object if found, None otherwise
    """
    try:
        service = get_drive_service(user)
        if not service:
            return None

        # Build query
        query = f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
        if parent_folder_id:
            query += f" and '{parent_folder_id}' in parents"

        response = service.files().list(
            q=query,
            spaces='drive',
            fields='files(id,name)'
        ).execute()
        
        folders = response.get('files', [])
        
        if folders:
            return folders[0]
        else:
            return None

    except HttpError as error:
        print(f"Drive API Error: {error}")
        return None
    except Exception as e:
        print(f"Unexpected error finding folder: {e}")
        return None

def create_subfolder_if_not_exists(user, folder_name, parent_folder_id):
    """
    Create a subfolder if it doesn't exist
    
    Args:
        user: Django user object
        folder_name: Name of the subfolder to create
        parent_folder_id: ID of the parent folder
    
    Returns:
        Folder ID if successful, None otherwise
    """
    try:
        # Check if folder already exists
        existing_folder = get_folder_by_name(user, folder_name, parent_folder_id)
        if existing_folder:
            print(f"Folder '{folder_name}' already exists with ID: {existing_folder['id']}")
            return existing_folder['id']

        # Create new folder
        folder_id = create_folder(user, folder_name, parent_folder_id)
        if folder_id:
            print(f"Created folder '{folder_name}' with ID: {folder_id}")
            return folder_id
        else:
            print(f"Failed to create folder '{folder_name}'")
            return None

    except Exception as e:
        print(f"Error creating subfolder: {e}")
        return None

def list_files_in_folder(user, folder_id):
    """
    List all files in a specific folder
    
    Args:
        user: Django user object
        folder_id: ID of the folder to list files from
    
    Returns:
        List of file objects
    """
    try:
        service = get_drive_service(user)
        if not service:
            return []

        query = f"'{folder_id}' in parents and trashed=false"
        
        response = service.files().list(
            q=query,
            spaces='drive',
            fields='files(id,name,mimeType,size,createdTime,webViewLink)',
            orderBy='createdTime desc'
        ).execute()
        
        return response.get('files', [])

    except HttpError as error:
        print(f"Drive API Error: {error}")
        return []
    except Exception as e:
        print(f"Unexpected error listing files: {e}")
        return []
