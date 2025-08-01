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
import time

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

@csrf_exempt
def ask_question(request):
    """Handle questions from the Meet assistant with enhanced transcript context and speaker identification"""
    start_time = time.time()
    
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    
    try:
        # Parse JSON
        parse_start = time.time()
        data = json.loads(request.body)
        question = data.get('question', '').strip()
        meeting_id = data.get('meeting_id')
        folder = data.get('folder', '')
        transcript = data.get('transcript', '')  # Enhanced meeting transcript with speakers
        full_conversation = data.get('full_conversation', [])  # Complete conversation data
        meeting_title = data.get('meeting_title', '')
        speakers = data.get('speakers', [])  # List of identified speakers
        audio_capture_enabled = data.get('audio_capture_enabled', False)
        conversation_context = data.get('conversation_context', {})
        parse_time = time.time() - parse_start
        
        if not question:
            return JsonResponse({'error': 'Question required'}, status=400)
        
        # Get meeting context if available
        db_start = time.time()
        meeting_context = ""
        if meeting_id:
            try:
                meeting = CalendarEvent.objects.get(id=meeting_id)
                duration_minutes = int(meeting.duration.total_seconds() / 60)
                meeting_context = f"Meeting: {meeting.title}\nDate: {meeting.date}\nDuration: {duration_minutes} minutes\nPlatform: {meeting.platform}\n"
            except CalendarEvent.DoesNotExist:
                pass
        db_time = time.time() - db_start
        
        # Enhanced context preparation with speaker information
        speaker_info = ""
        if speakers:
            speaker_info = f"Identified Speakers: {', '.join(speakers)}\n"
        
        audio_status = "Enhanced audio capture enabled" if audio_capture_enabled else "Basic audio recording"
        
        # Prepare enhanced context for the chatbot
        context = f"{meeting_context}\nMeeting Title: {meeting_title}\n{speaker_info}Audio Status: {audio_status}\nRecent Discussion: {transcript}\nUser Question: {question}"
        
        # Enhanced response logic using full conversation data
        response_start = time.time()
        
        # Get current topic and recent activity
        current_topic = conversation_context.get('current_topic', 'General discussion') if conversation_context else 'General discussion'
        recent_speakers = conversation_context.get('recent_speakers', speakers) if conversation_context else speakers
        
        # Analyze the full conversation for better context
        conversation_analysis = analyze_full_conversation(full_conversation)
        
        # Enhanced conversation analysis with Gemini AI
        if any(word in question.lower() for word in ['what', 'happened', 'talking', 'discussion', 'conversation', 'summary', 'going on', 'current', 'now', 'talk', 'discuss']):
            
            # Check for conversation history/summary questions
            if any(phrase in question.lower() for phrase in ['what happened', 'what was discussed', 'conversation summary', 'talking about', 'discussion summary']):
                answer = generate_ai_conversation_summary(full_conversation, speakers, conversation_analysis, question)
                
            elif 'topic' in question.lower() or 'about' in question.lower():
                answer = f"🎯 **Current Topic**: {current_topic}\n\n"
                answer += f"📊 **Active Participants**: {', '.join(recent_speakers[:5])}\n\n"
                if conversation_analysis['recent_points']:
                    answer += f"💬 **Recent Discussion Points**:\n"
                    for point in conversation_analysis['recent_points'][:3]:
                        answer += f"• {point['speaker']}: {point['text'][:100]}...\n"
                else:
                    answer += f"💬 **Recent Discussion**: {transcript[:200]}..."
                    
            elif 'who' in question.lower() or 'participant' in question.lower():
                answer = f"👥 **Meeting Participants**: {len(speakers)} people are actively participating\n\n"
                if conversation_analysis['speaker_activity']:
                    answer += f"📈 **Most Active Speakers**:\n"
                    for speaker_info in conversation_analysis['speaker_activity'][:3]:
                        answer += f"• {speaker_info['name']}: {speaker_info['contributions']} contributions\n"
                answer += f"\n🔊 **Currently Speaking**: {recent_speakers[-1] if recent_speakers else 'No recent activity'}"
                
            elif 'summary' in question.lower() or 'what happened' in question.lower():
                # Use AI-powered summary for comprehensive analysis
                answer = generate_ai_conversation_summary(full_conversation, speakers, conversation_analysis, question)
                        
            else:
                # General "what's happening" question
                answer = f"🎯 **Current Status**: The meeting is discussing {current_topic}\n\n"
                answer += f"👥 **Active Now**: {', '.join(recent_speakers[-3:]) if recent_speakers else 'No recent speakers'}\n\n"
                if full_conversation:
                    last_few = full_conversation[-3:] if len(full_conversation) >= 3 else full_conversation
                    answer += f"💬 **Latest Discussion**:\n"
                    for entry in last_few:
                        answer += f"• {entry.get('speaker', 'Unknown')}: {entry.get('text', '')[:80]}...\n"
        
        elif 'summary' in question.lower() or 'summarize' in question.lower():
            answer = "I can help you summarize the meeting. Use the 'Summarize Meeting' button for a comprehensive summary based on the full transcript with speaker analysis."
        
        elif 'agenda' in question.lower() or 'schedule' in question.lower():
            answer = "I can help you with meeting agendas and scheduling. What specific information do you need?"
        
        elif 'participant' in question.lower() or 'attendee' in question.lower():
            if speakers:
                answer = f"I can help you with participant information. The following speakers have been identified in this meeting: {', '.join(speakers)}. Please check the meeting details for complete attendee lists."
            else:
                answer = "I can help you with participant information. Please check the meeting details for attendee lists."
        
        elif 'folder' in question.lower() or 'document' in question.lower():
            if folder:
                # Try to get actual folder content
                folder_id = folder
                if 'drive.google.com' in folder:
                    if '/folders/' in folder:
                        folder_id = folder.split('/folders/')[1].split('/')[0]
                    elif 'id=' in folder:
                        folder_id = folder.split('id=')[1].split('&')[0]
                elif len(folder) >= 25 and folder.replace('-', '').isalnum():  # Google Drive folder IDs are typically 25-44 characters
                    # It's already a folder ID
                    folder_id = folder
                else:
                    # Try to extract folder ID from any format
                    folder_id = None
                    if '/folders/' in folder:
                        folder_id = folder.split('/folders/')[1].split('/')[0]
                    elif 'id=' in folder:
                        folder_id = folder.split('id=')[1].split('&')[0]
                    elif len(folder) >= 25 and folder.replace('-', '').isalnum():
                        folder_id = folder
                
                if folder_id:  # We have a valid folder ID
                    try:
                        service = get_drive_service(request.user)
                        if service:
                            files_info = get_files_from_drive_folder(service, folder_id)
                            if files_info:
                                file_list = [f"• {file['name']}" for file in files_info[:5]]
                                answer = f"The meeting is associated with folder: {folder}\n\n📁 Documents in folder:\n" + "\n".join(file_list)
                                if len(files_info) > 5:
                                    answer += f"\n... and {len(files_info) - 5} more files"
                            else:
                                answer = f"The meeting is associated with folder: {folder}\n\n📁 No files found in this folder."
                        else:
                            answer = f"The meeting is associated with folder: {folder}\n\n📁 Could not access folder content."
                    except Exception as e:
                        answer = f"The meeting is associated with folder: {folder}\n\n📁 Error accessing folder: {str(e)}"
                else:
                    answer = f"The meeting is associated with folder: {folder}\n\n📁 Could not extract folder ID from link."
            else:
                answer = "No specific folder is associated with this meeting. You can ask about meeting content or use the summarize feature."
        
        elif 'audio' in question.lower() or 'recording' in question.lower():
            if audio_capture_enabled:
                answer = f"Enhanced audio capture is currently enabled. The system is recording both your voice input and other participants' audio output with speaker identification. {len(speakers)} speakers have been identified so far."
            else:
                answer = "Basic audio recording is currently active. For enhanced audio capture with speaker identification, use the 'Toggle Audio Capture' button."
        
        else:
            # General question with enhanced transcript context
            if transcript:
                if speakers:
                    answer = f"I understand you're asking about: {question}. Based on the current discussion with {len(speakers)} participants, they are talking about: {transcript[:150]}... This should help provide context for your question."
                else:
                    answer = f"I understand you're asking about: {question}. Based on the current discussion, participants are talking about: {transcript[:150]}... This should help provide context for your question."
            else:
                answer = f"I understand you're asking about: {question}. I'm here to help with your meeting. You can ask me about meeting details, summaries, or any other meeting-related questions."
        
        response_time = time.time() - response_start
        
        total_time = time.time() - start_time
        
        # Log performance metrics
        logger.info(f'Ask question performance - Parse: {parse_time:.3f}s, DB: {db_time:.3f}s, Response: {response_time:.3f}s, Total: {total_time:.3f}s')
        
        return JsonResponse({
            'answer': answer,
            'question': question,
            'meeting_id': meeting_id,
            'transcript_used': bool(transcript),
            'speakers_identified': len(speakers),
            'audio_capture_enabled': audio_capture_enabled,
            'performance': {
                'parse_time': parse_time,
                'db_time': db_time,
                'response_time': response_time,
                'total_time': total_time
            }
        })
        
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        logger.error(f'Ask question error: {e}')
        return JsonResponse({'error': 'Server error'}, status=500)

@csrf_exempt
def summarize_meeting(request):
    """Generate enhanced meeting summary with transcript, speaker analysis, and folder analysis"""
    start_time = time.time()
    
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    
    try:
        # Parse JSON
        parse_start = time.time()
        data = json.loads(request.body)
        meeting_id = data.get('meeting_id')
        folder = data.get('folder', '')
        transcript = data.get('transcript', '')  # Enhanced transcript with speakers
        full_conversation = data.get('full_conversation', [])  # Complete conversation data
        meeting_title = data.get('meeting_title', '')
        meeting_duration = data.get('meeting_duration', '')
        speaker_analysis = data.get('speaker_analysis', {})  # Speaker participation analysis
        audio_capture_enabled = data.get('audio_capture_enabled', False)
        conversation_summary = data.get('conversation_summary', {})
        key_topics = data.get('key_topics', [])
        parse_time = time.time() - parse_start
        
        # Get meeting context if available
        db_start = time.time()
        meeting_context = ""
        if meeting_id:
            try:
                meeting = CalendarEvent.objects.get(id=meeting_id)
                duration_minutes = int(meeting.duration.total_seconds() / 60)
                meeting_context = f"Meeting: {meeting.title}\nDate: {meeting.date}\nDuration: {duration_minutes} minutes\nPlatform: {meeting.platform}\n"
            except CalendarEvent.DoesNotExist:
                pass
        db_time = time.time() - db_start
        
        # Enhanced summary generation with full conversation analysis
        response_start = time.time()
        
        # Analyze the full conversation
        conversation_analysis = analyze_full_conversation(full_conversation)
        
        # Generate comprehensive speaker participation summary
        speaker_summary = ""
        if conversation_analysis['speaker_activity']:
            total_speakers = len(conversation_analysis['speaker_activity'])
            most_active = conversation_analysis['speaker_activity'][0]['name'] if conversation_analysis['speaker_activity'] else 'Unknown'
            
            speaker_summary = f"\n\n🎤 **Speaker Analysis**:\n"
            speaker_summary += f"• Total participants: {total_speakers}\n"
            speaker_summary += f"• Most active speaker: {most_active}\n"
            speaker_summary += f"• Total contributions: {sum(s['contributions'] for s in conversation_analysis['speaker_activity'])}\n\n"
            
            speaker_summary += "📊 **Participation Breakdown**:\n"
            for speaker in conversation_analysis['speaker_activity'][:5]:  # Top 5 speakers
                percentage = round((speaker['contributions'] / len(full_conversation)) * 100) if full_conversation else 0
                speaker_summary += f"  - {speaker['name']}: {speaker['contributions']} contributions ({percentage}%), avg {speaker['avg_words']} words per message\n"
        
        # Generate audio capture summary
        audio_summary = ""
        if audio_capture_enabled:
            audio_summary = "\n🎵 Audio Recording: Enhanced audio capture was enabled, capturing both user input and other participants' audio output with speaker identification."
        else:
            audio_summary = "\n🎵 Audio Recording: Basic audio recording was used."
        
        # Generate transcript summary
        transcript_summary = ""
        if transcript:
            # Count total words and estimate speaking time
            total_words = len(transcript.split())
            estimated_minutes = max(1, total_words // 150)  # Assume 150 words per minute
            
            transcript_summary = f"\n📝 Transcript Summary:\n"
            transcript_summary += f"• Total transcript entries: {len(transcript.split('[')) - 1}\n"
            transcript_summary += f"• Estimated speaking time: {estimated_minutes} minutes\n"
            transcript_summary += f"• Total words captured: {total_words}\n"
        
        # Generate folder analysis if available
        folder_summary = ""
        if folder:
            try:
                service = get_drive_service(request.user)
                if service:
                    # Extract folder ID
                    folder_id = folder
                    if 'drive.google.com' in folder:
                        if '/folders/' in folder:
                            folder_id = folder.split('/folders/')[1].split('/')[0]
                        elif 'id=' in folder:
                            folder_id = folder.split('id=')[1].split('&')[0]
                    
                    if folder_id:
                        files_info = get_files_from_drive_folder(service, folder_id)
                        if files_info:
                            folder_summary = f"\n📁 Meeting Documents:\n"
                            folder_summary += f"• Total files in folder: {len(files_info)}\n"
                            folder_summary += "• Key documents:\n"
                            for file in files_info[:5]:
                                folder_summary += f"  - {file['name']}\n"
                            if len(files_info) > 5:
                                folder_summary += f"  ... and {len(files_info) - 5} more files\n"
                        else:
                            folder_summary = "\n📁 Meeting Documents: No files found in the associated folder."
            except Exception as e:
                folder_summary = f"\n📁 Meeting Documents: Error accessing folder - {str(e)}"
        
        # Combine all summaries
        summary = f"📋 Meeting Summary: {meeting_title}\n"
        summary += meeting_context
        summary += audio_summary
        summary += speaker_summary
        summary += transcript_summary
        summary += folder_summary
        
        # Add comprehensive key discussion topics and conversation insights
        if conversation_analysis['key_topics']:
            summary += f"\n🔑 **Key Discussion Topics**:\n"
            for topic in conversation_analysis['key_topics'][:8]:  # Top 8 topics
                summary += f"• {topic['topic']} (mentioned {topic['mentions']} times)\n"
        
        # Add conversation flow insights
        if full_conversation and len(full_conversation) > 1:
            summary += f"\n💬 **Conversation Insights**:\n"
            summary += f"• Meeting duration: ~{conversation_analysis['estimated_duration']} minutes\n"
            summary += f"• Average words per contribution: {round(sum(s['avg_words'] for s in conversation_analysis['speaker_activity']) / len(conversation_analysis['speaker_activity'])) if conversation_analysis['speaker_activity'] else 0}\n"
            
            # Show recent key points
            if conversation_analysis['recent_points']:
                summary += f"\n📝 **Recent Key Points**:\n"
                for point in conversation_analysis['recent_points'][-3:]:  # Last 3 points
                    summary += f"• {point.get('speaker', 'Unknown')}: {point.get('text', '')[:100]}...\n"
        
        response_time = time.time() - response_start
        total_time = time.time() - start_time
        
        # Log performance metrics
        logger.info(f'Summarize meeting performance - Parse: {parse_time:.3f}s, DB: {db_time:.3f}s, Response: {response_time:.3f}s, Total: {total_time:.3f}s')
        
        return JsonResponse({
            'summary': summary,
            'meeting_id': meeting_id,
            'total_speakers': speaker_analysis.get('totalSpeakers', 0) if speaker_analysis else 0,
            'audio_capture_enabled': audio_capture_enabled,
            'transcript_entries': len(transcript.split('[')) - 1 if transcript else 0,
            'performance': {
                'parse_time': parse_time,
                'db_time': db_time,
                'response_time': response_time,
                'total_time': total_time
            }
        })
        
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        logger.error(f'Summarize meeting error: {e}')
        return JsonResponse({'error': 'Server error'}, status=500)

def analyze_full_conversation(full_conversation):
    """Analyze the complete conversation data for better AI responses"""
    if not full_conversation or len(full_conversation) == 0:
        return {
            'recent_points': [],
            'speaker_activity': [],
            'key_topics': [],
            'estimated_duration': 0,
            'conversation_flow': []
        }
    
    # Get recent conversation points (last 5 entries)
    recent_points = full_conversation[-5:] if len(full_conversation) >= 5 else full_conversation
    
    # Analyze speaker activity
    speaker_counts = {}
    for entry in full_conversation:
        speaker = entry.get('speaker', 'Unknown')
        if speaker not in speaker_counts:
            speaker_counts[speaker] = {'contributions': 0, 'words': 0}
        speaker_counts[speaker]['contributions'] += 1
        speaker_counts[speaker]['words'] += len(entry.get('text', '').split())
    
    # Sort speakers by activity
    speaker_activity = []
    for speaker, data in speaker_counts.items():
        speaker_activity.append({
            'name': speaker,
            'contributions': data['contributions'],
            'words': data['words'],
            'avg_words': round(data['words'] / data['contributions']) if data['contributions'] > 0 else 0
        })
    speaker_activity.sort(key=lambda x: x['contributions'], reverse=True)
    
    # Extract key topics
    all_text = ' '.join([entry.get('text', '') for entry in full_conversation]).lower()
    words = all_text.split()
    
    # Filter out common words
    stop_words = {
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
        'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
        'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
        'will', 'would', 'could', 'should', 'may', 'might', 'can', 'must',
        'this', 'that', 'these', 'those', 'what', 'which', 'who', 'when', 'where', 'why', 'how',
        'yes', 'no', 'okay', 'ok', 'sure', 'well', 'so', 'now', 'then', 'here', 'there'
    }
    
    # Count word frequency
    filtered_words = [word.strip('.,!?;:"()[]{}') for word in words if len(word) > 3 and word not in stop_words]
    word_counts = Counter(filtered_words)
    
    # Get top topics
    key_topics = [{'topic': word, 'mentions': count} for word, count in word_counts.most_common(10)]
    
    # Estimate duration (assuming 150 words per minute average speaking rate)
    total_words = sum(len(entry.get('text', '').split()) for entry in full_conversation)
    estimated_duration = max(1, round(total_words / 150))
    
    # Analyze conversation flow
    conversation_flow = []
    for i, entry in enumerate(full_conversation):
        conversation_flow.append({
            'order': i + 1,
            'speaker': entry.get('speaker', 'Unknown'),
            'timestamp': entry.get('timestamp', ''),
            'word_count': len(entry.get('text', '').split())
        })
    
    return {
        'recent_points': recent_points,
        'speaker_activity': speaker_activity,
        'key_topics': key_topics,
        'estimated_duration': estimated_duration,
        'conversation_flow': conversation_flow
    }

def generate_ai_conversation_summary(full_conversation, speakers, conversation_analysis, user_question):
    """Generate AI-powered conversation summary using Gemini API"""
    try:
        # Prepare conversation data for AI analysis
        if not full_conversation or len(full_conversation) == 0:
            return "🤖 **AI Summary**: No conversation data available to analyze."
        
        # Format conversation for AI analysis
        conversation_text = ""
        for entry in full_conversation:
            speaker = entry.get('speaker', 'Unknown')
            text = entry.get('text', '')
            timestamp = entry.get('timestamp', '')
            conversation_text += f"[{timestamp}] {speaker}: {text}\n"
        
        # Prepare context for AI
        context_info = f"""
        Meeting Participants: {', '.join(speakers) if speakers else 'Unknown'}
        Total Exchanges: {len(full_conversation)}
        Estimated Duration: {conversation_analysis.get('estimated_duration', 0)} minutes
        Key Topics: {', '.join([topic['topic'] for topic in conversation_analysis.get('key_topics', [])[:5]])}
        """
        
        # Create AI prompt for conversation analysis
        ai_prompt = f"""
        You are an AI meeting assistant. Analyze the following conversation transcript and provide a comprehensive summary.
        
        User Question: {user_question}
        
        Meeting Context:
        {context_info}
        
        Conversation Transcript:
        {conversation_text}
        
        Please provide a detailed summary that includes:
        1. Main topics discussed
        2. Key decisions or conclusions
        3. Action items or next steps
        4. Participant contributions
        5. Important highlights
        
        Format your response with clear sections and bullet points. Make it informative and easy to read.
        """
        
        # Use Gemini AI to generate summary
        try:
            # Configure Gemini
            genai.configure(api_key=os.getenv('GEMINI_API_KEY'))
            model = genai.GenerativeModel('gemini-pro')
            
            # Generate AI response
            response = model.generate_content(ai_prompt)
            ai_summary = response.text
            
            # Format the AI response
            formatted_summary = f"🤖 **AI-Powered Conversation Analysis**\n\n{ai_summary}\n\n"
            formatted_summary += f"📊 **Meeting Stats**: {len(full_conversation)} exchanges, ~{conversation_analysis.get('estimated_duration', 0)} minutes\n"
            formatted_summary += f"👥 **Participants**: {', '.join(speakers) if speakers else 'Unknown'}"
            
            return formatted_summary
            
        except Exception as ai_error:
            logger.error(f'Gemini AI error: {ai_error}')
            # Fallback to basic summary if AI fails
            return generate_basic_conversation_summary(full_conversation, speakers, conversation_analysis)
            
    except Exception as e:
        logger.error(f'Conversation summary error: {e}')
        return f"🤖 **AI Summary Error**: Could not analyze conversation - {str(e)}"

def generate_basic_conversation_summary(full_conversation, speakers, conversation_analysis):
    """Generate basic conversation summary as fallback"""
    try:
        summary = "📋 **Conversation Summary**\n\n"
        
        # Basic stats
        summary += f"⏱️ **Duration**: ~{conversation_analysis.get('estimated_duration', 0)} minutes\n"
        summary += f"💬 **Total Exchanges**: {len(full_conversation)} messages\n"
        summary += f"👥 **Participants**: {', '.join(speakers) if speakers else 'Unknown'}\n\n"
        
        # Key topics
        if conversation_analysis.get('key_topics'):
            summary += f"🔑 **Key Topics Discussed**:\n"
            for topic in conversation_analysis['key_topics'][:5]:
                summary += f"• {topic['topic']} (mentioned {topic['mentions']} times)\n"
            summary += "\n"
        
        # Recent conversation points
        if conversation_analysis.get('recent_points'):
            summary += f"💬 **Recent Discussion**:\n"
            for point in conversation_analysis['recent_points'][-5:]:  # Last 5 points
                speaker = point.get('speaker', 'Unknown')
                text = point.get('text', '')[:100]
                summary += f"• {speaker}: {text}...\n"
        
        # Speaker activity
        if conversation_analysis.get('speaker_activity'):
            summary += f"\n📈 **Most Active Speakers**:\n"
            for speaker_info in conversation_analysis['speaker_activity'][:3]:
                summary += f"• {speaker_info['name']}: {speaker_info['contributions']} contributions\n"
        
        return summary
        
    except Exception as e:
        logger.error(f'Basic summary error: {e}')
        return "📋 **Summary Error**: Could not generate conversation summary."
