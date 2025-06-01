from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from google.oauth2.credentials import Credentials
from pathlib import Path
import json
from app.models import GoogleDriveToken

class Command(BaseCommand):
    help = "Migrate token.json files to database"

    def handleh(self, *args , **options):
        token_files = Path('path/to/tokens').glob('*.json')

        for token_file in token_files:
            user_id=token_file.stem # Assuming the file name is the user ID
            try:
                user =User.objects.get(id=user_id)
                with open(token_file) as f:
                    token_data = json.load(f)

                creds = Credentials(
                    token = token_data['token'],
                    refresh_token= token_data['refresh_token'],
                    token_uri = token_data['token_uri'],
                    client_id = token_data['client_id'],
                    client_secret = token_data['client_secret'],
                    scopes = token_data['scopes'],
                    expiry = token_data['expiry'],
                )
                GoogleDriveToken.from_credentials(user, creds)
                self.stdout.write(f"Successfully migrated token for user {user.username}")
            except Exception as e:
                self.stderr.write("Error migrating {token_file}:{str(e)}")git 