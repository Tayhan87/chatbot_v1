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



class UploadedFile(models.Model):
    """Model to track files uploaded to Google Drive"""
    user = models.ForeignKey(Person, on_delete=models.CASCADE)
    file_id = models.CharField(max_length=255, unique=True)  # Google Drive file ID
    filename = models.CharField(max_length=255)
    original_filename = models.CharField(max_length=255)  # Original filename from user's computer
    mime_type = models.CharField(max_length=100)
    file_size = models.BigIntegerField(null=True, blank=True)  # File size in bytes
    folder_id = models.CharField(max_length=255)  # Google Drive folder ID
    folder_name = models.CharField(max_length=255)  # Folder name for display
    web_view_link = models.URLField(blank=True, null=True)  # Google Drive web view link
    uploaded_at = models.DateTimeField(auto_now_add=True)
    created_time = models.DateTimeField(null=True, blank=True)  # Google Drive creation time
    
    # File type categories
    FILE_TYPE_CHOICES = [
        ('document', 'Document'),
        ('image', 'Image'),
        ('video', 'Video'),
        ('pdf', 'PDF'),
        ('text', 'Text/HTML'),
        ('other', 'Other'),
    ]
    file_type = models.CharField(max_length=20, choices=FILE_TYPE_CHOICES, default='other')
    
    def __str__(self):
        return f"{self.filename} ({self.user.email})"
    
    def get_file_type_display_name(self):
        """Get human-readable file type name"""
        return dict(self.FILE_TYPE_CHOICES).get(self.file_type, 'Other')
    
    def get_file_size_display(self):
        """Get human-readable file size"""
        if self.file_size is None:
            return "Unknown"
        
        size_bytes = int(self.file_size)

        if size_bytes == 0:
            return "0 B"

        units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
        i = 0
        size = float(size_bytes)
        while size >= 1024 and i < len(units) - 1:
            size /= 1024.0
            i += 1
        
        if units[i] == 'B':
            return f"{int(size)} {units[i]}"
        else:
            return f"{size:.2f} {units[i]}"
    
    class Meta:
        ordering = ['-uploaded_at']