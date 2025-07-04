from django.shortcuts import render,redirect
from django.contrib.auth import logout ,authenticate, login, get_user_model
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required
from django.contrib.auth.hashers import is_password_usable
from django.http import JsonResponse
from app.models import Person,CalendarEvent
from datetime import timedelta, datetime
import json
import pytz
from django.conf import settings
from django.utils import timezone

from google import genai
from chatbot_v1.drive import manage_folder,list_of_folders, get_drive_service
from chatbot_v1.calendar import create_google_calendar_event , update_google_calendar_event , delete_google_calendar_event

try:
    from allauth.socialaccount.models import SocialAccount, SocialToken
except ImportError:
    SocialAccount = None

def index(request):
    if request.user.is_authenticated:
        return redirect('chatbot')
    else:
        return redirect('login_page')

@csrf_exempt
def chat_api(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            user_message = data.get('message', '')

            client = genai.Client(api_key="AIzaSyDYrY-2iOMeLPD6oTTupY4WJeffZQXc1f8")
            try:
                response = client.models.generate_content(
                    model="gemini-2.0-flash",
                    contents=user_message,
                )
                print('Gemini response:', getattr(response, 'text', None))
                bot_response = response.text if response and hasattr(response, 'text') else "I'm not sure how to respond to that."
            except Exception as gemini_error:
                print('Gemini API error:', gemini_error)
                bot_response = f"[Gemini API error] {gemini_error}"

            return JsonResponse({'response': bot_response})
        except Exception as e:
            print('chat_api error:', e)
            return JsonResponse({'response': f'[Server error] {e}'}, status=500)
    return JsonResponse({'error': 'Invalid request'}, status=400)



def loginpage(request):
    return render(request,"app/loginpage.html")

@login_required
def chatbot(request):
    print(dict(request.session))
    print("Rendering chatbot page")
    email=request.user.email
    manage_folder(email)
    return render(request, 'app/chatbot.html')


@csrf_exempt
def signout(request):
    logout(request)
    return JsonResponse({'success': True})

@csrf_exempt
def checklogin(request):
    print("This is milestone")
    if request.method=="POST":
        print("This is autobot")
        data=json.loads(request.body)
        email=data.get("email","").strip()
        password=data.get("password","")
        #person=Person.objects.get(email=email)
        
        user =  authenticate(request,username=email,password=password)

        if user is not None:
            login(request, user)
            return JsonResponse({"success":"Can Log in", "redirect_url": "/chatbot/"},status=200)
        else:
            return JsonResponse({"error":"Can not find the account"},status=400)



@csrf_exempt
def signup(request):
    if request.method == "POST":
        print("Processing signup form")
        try:
            if request.content_type == "application/json":
                data = json.loads(request.body)
            else:
                data = request.POST
        except Exception as e:
            return JsonResponse({"error": "Invalid data format"}, status=400)

        username = data.get("name", "").strip()
        password = data.get("password", "")
        email = data.get("email", "").strip().lower()

        if not username or not password or not email:
            return JsonResponse({"error": "All fields are required"}, status=400)
        
        person = Person.objects.filter(email=email).first()
        if person and is_password_usable(person.password):
            return JsonResponse({"error": "Account already exist", "code": "email_exists"}, status=400)
        else:
            # Create a new Person object
            person = Person(username=username, email=email)
            person.set_password(password)
            person.save()

        return JsonResponse({"success": "User created successfully", "redirect_url": "/login/"}, status=201)
    return render(request, "app/signup.html")

def eventadd(request):
    # Fetch all folders from the user's Google Drive
    folders = []
    try:
        service = get_drive_service(request.user)
        if service:
            query = "mimeType='application/vnd.google-apps.folder' and trashed=false"
            response = service.files().list(q=query, fields='files(id,name)').execute()
            folders = response.get('files', [])
        else:
            print("Google Drive service could not be initialized for this user.")
    except Exception as e:
        print(f"Error fetching Google Drive folders: {e}")
    return render(request, "app/eventadd.html", {'folders': folders})

def folderList(request):
    if request.method=="POST":
        folders= list_of_folders(request.user.email)
        if not folders:
            print("No folders found for the user.")
            folders = []  # Ensure folders is always a list
        else:
            print(f"Found {len(folders)} folders for the user.")

        return JsonResponse({"folders":folders},status=200)



def mngmeeting(request):
    return render(request,"app/mngmeeting.html")



@csrf_exempt
def setmeeting(request):
    import json
    from datetime import datetime, timedelta
    import pytz
    from app.models import CalendarEvent
    from django.http import JsonResponse
    from chatbot_v1.calendar import create_google_calendar_event

    if request.method == "POST":
        data = json.loads(request.body)

        # Try to get the user, or use the first user as default for testing
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            User = get_user_model()
            try:
                user = User.objects.first()
            except Exception:
                return JsonResponse({"error": "No user found for saving meeting."}, status=400)

        meeting_info ={
            "meeting_title" : data.get("title", " ").strip(),
            "meeting_date" : data.get("date"," ").strip(),
            "meeting_time" : data.get("time"," ").strip(),
            "meeting_link" : data.get("link"," ").strip(),
            "meeting_folder" : data.get("folder", " ").strip(),
            "meeting_description" : data.get("description", " ").strip(),
        }

        try:
            naive_datetime = datetime.strptime(f"{meeting_info['meeting_date']} {meeting_info['meeting_time']}", "%Y-%m-%d %H:%M")
            tz = pytz.timezone("Asia/Dhaka")
            aware_datetime = tz.localize(naive_datetime)
            start_iso = aware_datetime.isoformat()
            end_time = aware_datetime + timedelta(minutes=60)
            end_iso = end_time.isoformat()
        except Exception as e:
            return JsonResponse({"error": f"Invalid date/time: {e}"}, status=400)

        meeting_info["meeting_start_time"] = start_iso
        meeting_info["meeting_end_time"] = end_iso

        try:
            event_id = None
            try:
                event_id = create_google_calendar_event(user.email, meeting_info)
            except Exception:
                pass  # Ignore calendar errors for now
            CalendarEvent.objects.create(
                user=user,
                title=meeting_info["meeting_title"],
                start_time=start_iso,
                end_time=end_iso,
                description=meeting_info["meeting_description"],
                folder=meeting_info["meeting_folder"],
                date=meeting_info["meeting_date"],
                event_id=event_id,
                link=meeting_info["meeting_link"],
            )
        except Exception as e:
            return JsonResponse({"error": f"Failed to save meeting: {e}"}, status=500)

        return JsonResponse({"message": "Meeting saved successfully"}, status=200)
    return JsonResponse({"error": "Invalid request"}, status=400)

@csrf_exempt
def showmeetings(request):
    from app.models import CalendarEvent
    from django.http import JsonResponse
    if request.method == 'GET':
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
                'duration': (event.end_time - event.start_time).seconds // 60 if event.end_time and event.start_time else 60,
                'platform': getattr(event, 'platform', ''),
                'reminder': getattr(event, 'reminder', ''),
            })
        return JsonResponse({'events': events_data}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=403)

@csrf_exempt
def editevent(request, id):
    if request.method == "PUT":
        from app.models import CalendarEvent
        import json
        from datetime import datetime, timedelta
        import pytz
        event = CalendarEvent.objects.get(id=id)
        data = json.loads(request.body)
        stime = data.get("time", " ").strip()
        sdate = data.get("date", " ").strip()
        naive_datetime = datetime.strptime(f"{sdate} {stime}", "%Y-%m-%d %H:%M")
        tz = pytz.timezone("Asia/Dhaka")
        aware_datetime = tz.localize(naive_datetime)
        start_iso = aware_datetime.isoformat()
        end_time = aware_datetime + timedelta(minutes=60)
        end_iso = end_time.isoformat()
        meeting_info = {
            "meeting_title": data.get("title", " ").strip(),
            "meeting_date": data.get("date", " ").strip(),
            "meeting_start_time": start_iso,
            "meeting_end_time": end_iso,
            "meeting_link": data.get("link", " ").strip(),
            "meeting_folder": data.get("folder", " ").strip(),
            "meeting_description": data.get("description", " ").strip(),
        }
        try:
            # Optionally update Google Calendar event here
            event.title = data.get("title", " ").strip()
            event.start_time = start_iso
            event.end_time = end_iso
            event.description = data.get("description", " ").strip()
            event.folder = data.get("folder", " ").strip()
            event.date = data.get("date", " ").strip()
            event.link = data.get("link", " ").strip()
            event.save()
            return JsonResponse({"message": "Event updated successfully"}, status=200)
        except Exception as e:
            print(f"Error updating event: {e}")
            return JsonResponse({"error": "Failed to update event"}, status=500)

@csrf_exempt
def deleteevent(request, id):
    if request.method == "DELETE":
        try:
            event = CalendarEvent.objects.get(id=id)
            event.delete()
            # Optionally: delete_google_calendar_event(event.user.email, event.event_id)
            print("Event deleted successfully.")
            return JsonResponse({"message": "Event Deleted successfully"}, status=200)
        except CalendarEvent.DoesNotExist:
            print("Event not found.")
            return JsonResponse({"error": "Event not found."}, status=404)
        except Exception as e:
            print(f"Unexpected error deleting event: {e}")
            return JsonResponse({"error": "Failed to delete event"}, status=500)

@csrf_exempt
def is_google_user(request):
    if not request.user.is_authenticated:
        return JsonResponse({'is_google_user': False})
    if SocialAccount:
        is_google = SocialAccount.objects.filter(user=request.user, provider='google').exists()
        return JsonResponse({'is_google_user': is_google})
    return JsonResponse({'is_google_user': False})

@login_required
def google_picker_config(request):
    import logging
    logger = logging.getLogger(__name__)
    api_key = getattr(settings, 'GOOGLE_API_KEY', None)
    token = None
    error_message = None
    try:
        from allauth.socialaccount.models import SocialToken, SocialAccount
        account = SocialAccount.objects.get(user=request.user, provider='google')
        logger.info(f"Found Google SocialAccount for user {request.user}")
        token_obj = SocialToken.objects.get(account=account)
        token = token_obj.token
        logger.info(f"Found Google SocialToken for user {request.user}")
    except SocialAccount.DoesNotExist:
        logger.error(f"No Google SocialAccount for user {request.user}")
        error_message = "You are not logged in with Google. Please use 'Continue with Google' to log in."
    except SocialToken.DoesNotExist:
        logger.error(f"No Google SocialToken for user {request.user}")
        error_message = "Google authentication token not found. Please re-login with Google."
    except Exception as e:
        logger.error(f"Error fetching Google token for user {request.user}: {e}")
        error_message = str(e)
    if not token:
        return JsonResponse({
            'apiKey': api_key,
            'accessToken': None,
            'error': error_message or 'Google Drive integration is not available.'
        }, status=403)
    return JsonResponse({
        'apiKey': api_key,
        'accessToken': token,
        'error': None
    })

@csrf_exempt
def update_today_meeting_folder(request):
    import json
    from app.models import CalendarEvent
    from django.http import JsonResponse
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            folder_link = data.get('folder_link', '').strip()
            if not folder_link:
                return JsonResponse({'error': 'No folder link provided.'}, status=400)
            user = getattr(request, 'user', None)
            if not user or not user.is_authenticated:
                User = get_user_model()
                user = User.objects.first()
            today = timezone.localdate()
            meeting = CalendarEvent.objects.filter(user=user, date=str(today)).first()
            if not meeting:
                return JsonResponse({'error': 'No meeting found for today.'}, status=404)
            meeting.folder = folder_link
            meeting.save()
            return JsonResponse({'success': True})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid request method.'}, status=405)

@csrf_exempt
def update_meeting_folder(request):
    import json
    from app.models import CalendarEvent
    from django.http import JsonResponse
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            meeting_id = data.get('meeting_id')
            folder_link = data.get('folder_link', '').strip()
            if not meeting_id or not folder_link:
                return JsonResponse({'error': 'Meeting and folder link required.'}, status=400)
            meeting = CalendarEvent.objects.filter(id=meeting_id).first()
            if not meeting:
                return JsonResponse({'error': 'Meeting not found.'}, status=404)
            meeting.folder = folder_link
            meeting.save()
            return JsonResponse({'success': True})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid request method.'}, status=405)

@csrf_exempt
@login_required
def upload_folder(request):
    if request.method != "POST":
        return JsonResponse({"success": False, "error": "POST only"})
    files = request.FILES.getlist("files")
    if not files:
        return JsonResponse({"success": False, "error": "No files received"})

    # Get user's Google credentials (implement this for your app)
    creds = get_user_google_credentials(request.user)
    if not creds:
        return JsonResponse({"success": False, "error": "Google account not linked"})

    try:
        upload_files_to_drive(files, creds)
        return JsonResponse({"success": True})
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)})

@csrf_exempt  #added by sumon
@login_required
def userinfo(request):
    user = request.user
    # Use username if available, else fallback to email
    name = user.username if user.username else user.email
    email = user.email
    # If you add a profile image field in the future, include it here
    return JsonResponse({
        'name': name,
        'email': email,
        # 'profile_image': user.profile_image.url if hasattr(user, 'profile_image') and user.profile_image else None
    })




