from django.db import models
from django.utils import timezone
from datetime import datetime
from google.oauth2.credentials import Credentials
from django.contrib.auth.models import AbstractUser, User, PermissionsMixin , BaseUserManager

# Create your models here.
def parse_google_datetime(dt_str):
    """Parse Google's datetime string with or without 'Z' suffix"""
    try:
        return datetime.strptime(dt_str, "%Y-%m-%dT%H:%M:%S.%fZ")
    except ValueError:
        return datetime.strptime(dt_str, "%Y-%m-%dT%H:%M:%S.%f")

class GoogleDriveToken(models.Model):
    user = models.OneToOneField('Person' , on_delete=models.CASCADE)
    access_token = models.TextField(null=False , blank=False)
    refresh_token = models.TextField(null=True , blank=True)
    token_uri = models.TextField(default="https://oauth2.googleapis.com/token")
    client_id = models.TextField(null=False , blank=False)
    client_secret = models.TextField(null=False , blank=False)
    scopes = models.TextField()
    expiry = models.DateTimeField()

    def __str__(self):
        return f"Google Drive Token for {self.user.username}"

    @classmethod
    def from_credentials(cls,user,credentials):
        expiry = credentials.expiry
        if expiry and  not timezone.is_aware(expiry):
            expiry = timezone.make_aware(expiry)

        if not credentials.refresh_token:
            print("⚠️ Warning: No refresh_token received. Future refresh will fail.")


        return cls.objects.update_or_create(
            user=user,
            defaults={
                'access_token':credentials.token,
                'refresh_token':credentials.refresh_token,
                'token_uri':credentials.token_uri,
                'client_id' : credentials.client_id,
                'client_secret' : credentials.client_secret,
                'scopes' : ','.join(credentials.scopes),
                'expiry' : expiry
            }
        )
    
    def to_credentials(self):
        try:
            expiry = self.expiry
            if timezone.is_aware(expiry):
                expiry = timezone.make_naive(expiry)

            return Credentials(
              token = self.access_token,
              refresh_token = self.refresh_token,
              token_uri =self.token_uri,
              client_id = self.client_id,
              client_secret = self.client_secret,
              scopes = self.scopes.split(','),
              expiry = timezone.make_naive(self.expiry) if timezone.is_aware(self.expiry) else self.expiry )
           
        except Exception as e:
            raise ValueError(f"Invalid conversion failed:{str(e)}")
        

class PersonManager(BaseUserManager):
    def create_user(self, email,password=None,**extra_fields):
        if not email:
            raise ValueError ("The Email field must be set")
        email =self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user
    
    def create_superuser(self,email,password=None,**extra_fields):
        extra_fields.setdefault('is_staff',True)
        extra_fields.setdefault('is_superuser',True)
        return self.create_user(email,password,**extra_fields)
        
class Person(AbstractUser):

    email = models.EmailField(unique=True, null=False,blank=False)
    created_at = models.DateTimeField(auto_now_add=True)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    objects = PersonManager()



