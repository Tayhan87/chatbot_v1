# You can place this in a utils.py file in your app, or directly in views.py
from allauth.socialaccount.models import SocialToken,SocialAccount
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from google.auth.transport.requests import Request
from django.conf import settings # To get your client_id and secret
from googleapiclient.errors import HttpError

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
