from django.db import models
from django.utils import timezone
from datetime import datetime
from google.oauth2.credentials import Credentials
from django.contrib.auth.models import AbstractUser, User, PermissionsMixin , BaseUserManager


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
    username= models.CharField(max_length=150 , unique = False, null = True , blank = True)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    objects = PersonManager()

class CalendarEvent(models.Model):
    user = models.ForeignKey(Person, on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    date = models.DateField(default=timezone.now)  # Date of the event
    created_at = models.DateTimeField(auto_now_add=True)
    description = models.TextField(blank=True, null=True)
    link = models.URLField(blank=True, null=True)  # Link to the event (e.g., Google Meet link)
    folder = models.CharField(max_length=255, blank=True, null=True)  # Folder for the event
    event_id = models.CharField(max_length=255, blank=True, null=True)  # Google Calendar event ID

    def __str__(self):
        return f"{self.title} ({self.start_time} - {self.end_time})"
    
    def save(self, *args, **kwargs):
        if not self.end_time:
            self.end_time = self.start_time + timezone.timedelta(hours=1)  # Default duration of 1 hour
        super().save(*args, **kwargs)



