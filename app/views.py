from django.shortcuts import render, redirect
from django.contrib.auth import logout, authenticate, login, get_user_model
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from app.models import Person, CalendarEvent
from datetime import datetime, timedelta
import json
import pytz
from django.conf import settings
from django.utils import timezone
import google.generativeai as genai
from chatbot_v1.drive import manage_folder, list_of_folders, get_drive_service
from chatbot_v1.calendar import create_google_calendar_event
import logging
import os
import mimetypes
import io
import tempfile
from googleapiclient.http import MediaIoBaseDownload

# Imports for text extraction
import docx
from PyPDF2 import PdfReader


logger = logging.getLogger(__name__)

# Check for allauth availability
try:
    from allauth.socialaccount.models import SocialAccount, SocialToken
except ImportError:
    SocialAccount = None

def get_files_from_drive_folder(service, folder_id):
    """
    Recursively finds all supported files (PDF, DOCX, images) in a given Google Drive folder
    and its subfolders.

    Args:
        service: An authenticated Google Drive service object.
        folder_id (str): The ID of the root Google Drive folder.

    Returns:
        list: A list of dictionaries, each containing the 'id', 'name', and 'mimeType' of a supported file.
    """
    supported_mime_types = {
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'image/heif'
    }
    files_to_process = []
    folders_to_visit = [folder_id]  # Start with the root folder

    while folders_to_visit:
        current_folder_id = folders_to_visit.pop(0)
        page_token = None
        while True:
            try:
                response = service.files().list(
                    q=f"'{current_folder_id}' in parents and trashed=false",
                    spaces='drive',
                    fields='nextPageToken, files(id, name, mimeType)',
                    pageToken=page_token
                ).execute()

                for file in response.get('files', []):
                    mime_type = file.get('mimeType')
                    if mime_type == 'application/vnd.google-apps.folder':
                        # If it's a folder, add it to the list to visit
                        folders_to_visit.append(file.get('id'))
                    elif mime_type in supported_mime_types:
                        # If it's a supported file, add its details to our list
                        files_to_process.append({
                            'id': file.get('id'),
                            'name': file.get('name'),
                            'mimeType': mime_type
                        })
                
                page_token = response.get('nextPageToken', None)
                if page_token is None:
                    break
            except Exception as e:
                logger.error(f"Error listing files in Drive folder {current_folder_id}: {e}")
                break  # Stop processing this folder on error
    return files_to_process

@csrf_exempt
def chat_api(request):
    """
    Handle chatbot API requests. It processes files from a Google Drive folder by
    downloading them, extracting text from documents, and uploading images.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Invalid request'}, status=400)
    
    temp_file_paths = []  # To keep track of all temporary files for cleanup
    try:
        data = json.loads(request.body)
        user_message = data.get('message', '')
        folder_id = data.get('folder')

        api_key = getattr(settings, 'GEMINI_API_KEY', None)
        if not api_key:
            logger.error('Gemini API key not configured')
            return JsonResponse({'response': 'Service unavailable'}, status=503)
        
        genai.configure(api_key=api_key)
        
        prompt_parts = [user_message]

        if folder_id:
            service = get_drive_service(request.user)
            if not service:
                logger.error("Could not get Google Drive service for the user.")
                return JsonResponse({'response': 'Could not access Google Drive.'}, status=500)

            files_info = get_files_from_drive_folder(service, folder_id)
            
            text_mime_types = {
                'application/pdf',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            }
            image_mime_types = {'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'}

            for file_info in files_info:
                file_id = file_info['id']
                file_name = file_info['name']
                mime_type = file_info['mimeType']
                temp_path = None

                try:
                    # Step 1: Download the file to a temporary path regardless of type
                    logger.info(f"Downloading '{file_name}' from Drive.")
                    request_download = service.files().get_media(fileId=file_id)
                    _, file_extension = os.path.splitext(file_name)
                    
                    # Create a temporary file and ensure we have its path
                    with tempfile.NamedTemporaryFile(delete=False, suffix=file_extension) as temp_file:
                        temp_path = temp_file.name
                        downloader = MediaIoBaseDownload(temp_file, request_download)
                        done = False
                        while not done:
                            status, done = downloader.next_chunk()

                    temp_file_paths.append(temp_path) # Add to list for cleanup

                    # Step 2: Process the downloaded file based on its type
                    if mime_type in text_mime_types:
                        logger.info(f"Extracting text from '{file_name}'.")
                        text_content = ""
                        if mime_type == 'application/pdf':
                            with open(temp_path, 'rb') as f:
                                reader = PdfReader(f)
                                for page in reader.pages:
                                    extracted = page.extract_text()
                                    if extracted:
                                        text_content += extracted + "\n"
                        elif mime_type == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                            doc = docx.Document(temp_path)
                            for para in doc.paragraphs:
                                text_content += para.text + "\n"
                        
                        if text_content.strip():
                            prompt_parts.append(f"\n--- Content from file: {file_name} ---\n{text_content}")
                        else:
                            logger.warning(f"No text could be extracted from '{file_name}'.")

                    elif mime_type in image_mime_types:
                        logger.info(f"Uploading image '{file_name}' to Gemini.")
                        uploaded_file = genai.upload_file(path=temp_path, display_name=file_name)
                        prompt_parts.append(uploaded_file)

                except Exception as e:
                    logger.error(f"Failed to process file '{file_name}' (ID: {file_id}): {e}")
                    prompt_parts.append(f"\n--- Could not process file: {file_name} ---")
                    # If the temp file was created before the error, it will be cleaned up in `finally`

        model = genai.GenerativeModel(model_name="gemini-1.5-flash")
        response = model.generate_content(prompt_parts)
        
        bot_response = response.text if response and hasattr(response, 'text') else "I'm not sure how to respond to that."
        return JsonResponse({'response': bot_response})
        
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        logger.exception('chat_api error')
        return JsonResponse({'response': f'Service error: {e}'}, status=500)
    finally:
        # Clean up any temporary files that were created
        for path in temp_file_paths:
            try:
                os.remove(path)
                logger.info(f"Removed temporary file: {path}")
            except OSError as e:
                logger.error(f"Error removing temporary file {path}: {e}")


def index(request):
    """Redirect authenticated users to chatbot, others to login"""
    return redirect('chatbot' if request.user.is_authenticated else 'login_page')

def loginpage(request):
    """Render login page"""
    return render(request, "app/loginpage.html")

@login_required
def chatbot(request):
    """Main chatbot interface"""
    manage_folder(request.user.email)
    return render(request, 'app/chatbot.html')

@csrf_exempt
def signout(request):
    """Handle user logout"""
    logout(request)
    return JsonResponse({'success': True})

@csrf_exempt
def checklogin(request):
    """Authenticate user credentials"""
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)
    
    try:
        data = json.loads(request.body)
        email = data.get("email", "").strip()
        password = data.get("password", "")
        
        if not email or not password:
            return JsonResponse({"error": "Email and password required"}, status=400)
            
        user = authenticate(request, username=email, password=password)
        if user:
            login(request, user)
            return JsonResponse({"success": "Authenticated", "redirect_url": "/chatbot/"}, status=200)
        
        return JsonResponse({"error": "Invalid credentials"}, status=401)
        
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

@csrf_exempt
def signup(request):
    """Handle new user registration"""
    if request.method != "POST":
        return render(request, "app/signup.html")
    
    try:
        data = json.loads(request.body) if request.content_type == "application/json" else request.POST
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid data format"}, status=400)
    
    username = data.get("name", "").strip()
    password = data.get("password", "")
    email = data.get("email", "").strip().lower()

    if not all([username, password, email]):
        return JsonResponse({"error": "All fields are required"}, status=400)
    
    if Person.objects.filter(email=email).exists():
        return JsonResponse({"error": "Email already exists", "code": "email_exists"}, status=409)
    
    try:
        Person.objects.create_user(
            username=username, 
            email=email, 
            password=password
        )
        return JsonResponse({"success": "User created", "redirect_url": "/login/"}, status=201)
    except Exception as e:
        logger.exception('User creation failed')
        return JsonResponse({"error": "Account creation failed"}, status=500)

# Calendar Event Views
def eventadd(request):
    """Render event creation page with Google Drive folders"""
    folders = []
    try:
        service = get_drive_service(request.user)
        if service:
            response = service.files().list(
                q="mimeType='application/vnd.google-apps.folder' and trashed=false",
                fields='files(id,name)'
            ).execute()
            folders = response.get('files', [])
    except Exception as e:
        logger.error(f'Drive folder error: {e}')
    
    return render(request, "app/eventadd.html", {'folders': folders})

@csrf_exempt
def folderList(request):
    """Get list of user's Google Drive folders"""
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)
    
    try:
        service = get_drive_service(request.user)
        response =service.files().list(
            q="mimeType='application/vnd.google-apps.folder' and trashed=false",
            fields='files(id,name)'
        ).execute()
        folders = response.get('files', [])
        return JsonResponse({"folders": folders}, status=200)
    except Exception as e:
        logger.error(f'Folder list error: {e}')
        return JsonResponse({"error": "Could not fetch folders"}, status=500)

def mngmeeting(request):
    """Render meeting management page"""
    return render(request, "app/mngmeeting.html")

@csrf_exempt
def setmeeting(request):
    """Create new calendar event"""
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)
    
    try:
        data = json.loads(request.body)
        user = request.user if request.user.is_authenticated else get_user_model().objects.first()
        
        if not user:
            return JsonResponse({"error": "No user available"}, status=400)
        
        # Parse datetime using project timezone
        tz = pytz.timezone(settings.TIME_ZONE)
        naive_datetime = datetime.strptime(
            f"{data['date']} {data['time']}", 
            "%Y-%m-%d %H:%M"
        )
        aware_datetime = naive_datetime.replace(tzinfo=pytz.UTC)
        
        meeting_info = {
            "meeting_title": data.get("title", "").strip(),
            "meeting_date": data.get("date", "").strip(),
            "meeting_start_time": aware_datetime.isoformat(),
            "meeting_end_time": (aware_datetime + timedelta(minutes=60)).isoformat(),
            "meeting_link": data.get("link", "").strip(),
            "meeting_folder": data.get("folder", "").strip(),
            "meeting_description": data.get("description", "").strip(),
            "meeting_platform": data.get("platform", "").strip(),
            "meeting_reminder": data.get("reminder", "").strip(),
            "meeting_duration": data.get("duration"),  # Default to 60 minutes
        }
        time_x=timedelta(minutes=int(meeting_info["meeting_duration"]))
        print("Meeting Start Time:", meeting_info["meeting_start_time"])
        
        # Create calendar event
        event_id = create_google_calendar_event(user.email, meeting_info)
        
        # Save to database
        CalendarEvent.objects.create(
            user=user,
            title=meeting_info["meeting_title"],
            start_time=meeting_info["meeting_start_time"],
            end_time=meeting_info["meeting_end_time"],
            description=meeting_info["meeting_description"],
            folder=meeting_info["meeting_folder"],
            date=meeting_info["meeting_date"],
            event_id=event_id,
            link=meeting_info["meeting_link"],
            platform=meeting_info["meeting_platform"],
            reminder=meeting_info["meeting_reminder"],
            duration=time_x,
        )
        
        return JsonResponse({"message": "Meeting scheduled"}, status=201)
        
    except KeyError as e:
        return JsonResponse({"error": f"Missing field: {e}"}, status=400)
    except ValueError as e:
        return JsonResponse({"error": f"Invalid date format: {e}"}, status=400)
    except Exception as e:
        logger.exception('Meeting creation failed')
        return JsonResponse({"error": "Meeting scheduling failed"}, status=500)

@csrf_exempt
def showmeetings(request):
    """Get all calendar events"""
    if request.method != 'GET':
        return JsonResponse({'error': 'Invalid request method'}, status=405)
    
    try:
        events = CalendarEvent.objects.all().order_by('-start_time')
        events_data = []
        for event in events:
            events_data.append({
                'id': event.id,
                'title': event.title,
                'time': event.start_time.strftime('%H:%M'),
                'date': event.date.isoformat(),
                'description': event.description,
                'folder': event.folder,
                'link': event.link,
                'duration': event.duration/ timedelta(minutes=1) ,
                'platform': getattr(event, 'platform', ''),
                'reminder': getattr(event, 'reminder', ''),
            })
        return JsonResponse({'events': events_data}, status=200)
    except Exception as e:
        logger.error(f'Show meetings error: {e}')
        return JsonResponse({'error': 'Could not fetch events'}, status=500)

@csrf_exempt
def editevent(request, id):
    """Update existing calendar event"""
    if request.method != "PUT":
        return JsonResponse({"error": "Method not allowed"}, status=405)
    
    try:
        event = CalendarEvent.objects.get(id=id)
        data = json.loads(request.body)
        
        # Parse datetime
        tz = pytz.timezone(settings.TIME_ZONE)
        naive_datetime = datetime.strptime(
            f"{data['date']} {data['time']}", 
            "%Y-%m-%d %H:%M"
        )
        aware_datetime = naive_datetime.replace(tzinfo=pytz.UTC)
        print("Aware Datetime:", aware_datetime)
        
        # Update event fields
        event.title = data.get("title", "").strip()
        event.start_time = aware_datetime
        event.end_time = aware_datetime + timedelta(minutes=60)
        event.description = data.get("description", "").strip()
        event.folder = data.get("folder", "").strip()
        event.date = data.get("date", "").strip()
        event.link = data.get("link", "").strip()
        event.platform = data.get("platform", "").strip()
        event.reminder = data.get("reminder", "").strip()
        event.duration = timedelta(minutes=int(data.get("duration", 60)))
        
        event.save()
        return JsonResponse({"message": "Event updated successfully"}, status=200)
        
    except CalendarEvent.DoesNotExist:
        return JsonResponse({"error": "Event not found"}, status=404)
    except KeyError as e:
        return JsonResponse({"error": f"Missing field: {e}"}, status=400)
    except ValueError as e:
        return JsonResponse({"error": f"Invalid date format: {e}"}, status=400)
    except Exception as e:
        logger.error(f'Event update error: {e}')
        return JsonResponse({"error": "Failed to update event"}, status=500)

@csrf_exempt
def deleteevent(request, id):
    """Delete calendar event"""
    if request.method != "DELETE":
        return JsonResponse({"error": "Method not allowed"}, status=405)
    
    try:
        event = CalendarEvent.objects.get(id=id)
        event.delete()
        return JsonResponse({"message": "Event deleted successfully"}, status=200)
    except CalendarEvent.DoesNotExist:
        return JsonResponse({"error": "Event not found"}, status=404)
    except Exception as e:
        logger.error(f'Event deletion error: {e}')
        return JsonResponse({"error": "Failed to delete event"}, status=500)

@csrf_exempt
def is_google_user(request):
    """Check if user logged in with Google"""
    if not request.user.is_authenticated:
        return JsonResponse({'is_google_user': False})
    
    try:
        is_google = SocialAccount.objects.filter(
            user=request.user, 
            provider='google'
        ).exists() if SocialAccount else False
        return JsonResponse({'is_google_user': is_google})
    except Exception as e:
        logger.error(f'Google user check error: {e}')
        return JsonResponse({'is_google_user': False})

@login_required
def google_picker_config(request):
    """Get Google Picker configuration"""
    api_key = getattr(settings, 'GOOGLE_API_KEY', None)
    token = None
    error_message = None
    
    try:
        if SocialAccount:
            account = SocialAccount.objects.get(user=request.user, provider='google')
            token_obj = SocialToken.objects.get(account=account)
            token = token_obj.token
        else:
            error_message = "SocialAccount not available"
    except SocialAccount.DoesNotExist:
        error_message = "No Google account linked"
    except SocialToken.DoesNotExist:
        error_message = "Google token not found"
    except Exception as e:
        logger.error(f'Google config error: {e}')
        error_message = str(e)
    
    if not token:
        return JsonResponse({
            'apiKey': api_key,
            'accessToken': None,
            'error': error_message or 'Google Drive integration unavailable'
        }, status=403)
    
    return JsonResponse({
        'apiKey': api_key,
        'accessToken': token,
        'error': None
    })

@csrf_exempt
def update_today_meeting_folder(request):
    """Update folder for today's meeting"""
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    
    try:
        data = json.loads(request.body)
        folder_link = data.get('folder_link', '').strip()
        if not folder_link:
            return JsonResponse({'error': 'Folder link required'}, status=400)
            
        user = request.user if request.user.is_authenticated else get_user_model().objects.first()
        if not user:
            return JsonResponse({'error': 'User not available'}, status=400)
            
        today = timezone.localdate()
        meeting = CalendarEvent.objects.filter(user=user, date=str(today)).first()
        
        if not meeting:
            return JsonResponse({'error': 'No meeting today'}, status=404)
            
        meeting.folder = folder_link
        meeting.save()
        return JsonResponse({'success': True})
        
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        logger.error(f'Update folder error: {e}')
        return JsonResponse({'error': 'Server error'}, status=500)

@csrf_exempt
def update_meeting_folder(request):
    """Update folder for specific meeting"""
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    
    try:
        data = json.loads(request.body)
        meeting_id = data.get('meeting_id')
        folder_link = data.get('folder_link', '').strip()
        
        if not meeting_id or not folder_link:
            return JsonResponse({'error': 'Meeting ID and folder link required'}, status=400)
            
        meeting = CalendarEvent.objects.filter(id=meeting_id).first()
        if not meeting:
            return JsonResponse({'error': 'Meeting not found'}, status=404)
            
        meeting.folder = folder_link
        meeting.save()
        return JsonResponse({'success': True})
        
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        logger.error(f'Meeting folder update error: {e}')
        return JsonResponse({'error': 'Server error'}, status=500)

@csrf_exempt
@login_required
def upload_folder(request):
    """Handle file uploads (stub implementation)"""
    if request.method != "POST":
        return JsonResponse({"success": False, "error": "POST only"}, status=405)
    
    # Actual implementation would go here
    return JsonResponse({"success": False, "error": "Not implemented"}, status=501)

@csrf_exempt
@login_required
def userinfo(request):
    """Get current user information"""
    user = request.user
    return JsonResponse({
        'name': user.username or user.email,
        'email': user.email,
    })
