from django.db import models
from google.oauth2.credentials import Credentials
from django.contrib.auth.models import User

# Create your models here.

class GoogleDriveToken(models.Model):
    user = models.OneToOneField(User , on_delete=models.CASCADE)
    access_token = models.TextField(null=False , blank=False)
    refresh_token = models.TextField(null=False , blank=False)
    token_uri = models.TextField(default="https://oauth2.googleapis.com/token")
    client_id = models.TextField(null=False , blank=False)
    client_secret = models.TextField(null=False , blank=False)
    scopes = models.TextField()
    expiry = models.DateTimeField()

    def __str__(self):
        return f"Google Drive Token for {self.user.username}"

    @classmethod
    def from_credentials(cls,user,credentials):
        return cls.objects.update_or_create(
            user=user,
            defaults={
                'access_token':credentials.token,
                'refresh_token':credentials.refresh_token,
                'token_uri':credentials.token_uri,
                'client_id' : credentials.client_id,
                'client_secret' : credentials.client_secret,
                'scopes' : ','.join(credentials.scopes),
                'expiry' : credentials.expiry,
            }
        )
    
    def to_credentials(self):
        try:
            return Credentials(
              token = self.access_token,
              refresh_token = self.refresh_token,
              token_uri =self.token_uri,
              client_id = self.client_id,
              client_secret = self.client_secret,
              scopes = self.scopes.split(','),
              expiry = self.expiry
           )
        except Exception as e:
            raise ValueError(f"Invalid conversion failed:{str(e)}")

