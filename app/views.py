from django.shortcuts import render,redirect
from django.contrib.auth import logout ,authenticate, login
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required
from django.contrib.auth.hashers import is_password_usable
from django.http import JsonResponse
from app.models import Person,CalendarEvent
from datetime import timedelta, datetime
import json
import pytz
from django.conf import settings

from google import genai
from chatbot_v1.drive import manage_folder,list_of_folders
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
    if request.method == "POST":
        logout(request)
        return JsonResponse({"message":"Grant to Logout"}, status=200)
    
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
    folders= list_of_folders(request.user.email)
    if not folders:
        print("No folders found for the user.")
        folders = []  # Ensure folders is always a list
    else:
        print(f"Found {len(folders)} folders for the user.")

    return render(request,"app/eventadd.html",{'folders': folders})

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



def setmeeting(request):
    if request.method == "POST":
        data=json.loads(request.body)

        meeting_info ={
        "meeting_title" : data.get("title", " ").strip(),
        "meeting_date" : data.get("date"," ").strip(),
        "meeting_time" : data.get("time"," ").strip(),
        "meeting_link" : data.get("link"," ").strip(),
        "meeting_folder" : data.get("folder", " ").strip(),
        "meeting_description" : data.get("description", " ").strip(),
        "meeting_folder" : data.get("folder", " ").strip(),
        }

        naive_datetime = datetime.strptime(f"{meeting_info['meeting_date']} {meeting_info['meeting_time']}", "%Y-%m-%d %H:%M")
        tz = pytz.timezone("Asia/Dhaka")
        aware_datetime = tz.localize(naive_datetime)
        start_iso = aware_datetime.isoformat()
        end_time = aware_datetime + timedelta(minutes=60)
        end_iso = end_time.isoformat()

        meeting_info["meeting_start_time"] = start_iso
        meeting_info["meeting_end_time"] = end_iso

        event_id= create_google_calendar_event(request.user.email, meeting_info)
        CalendarEvent.objects.create(
            user=request.user,
            title = meeting_info["meeting_title"],
            start_time = start_iso,
            end_time = end_iso , # Adjust as needed
            description = meeting_info["meeting_description"],
            folder = meeting_info["meeting_folder"],
            date = meeting_info["meeting_date"],
            event_id = event_id,  # Store the Google Calendar event ID
            link = meeting_info["meeting_link"],
        )

        print(meeting_info["meeting_time"])
        print(meeting_info['meeting_date'])
        print(meeting_info["meeting_folder"])

    return JsonResponse({"message": "Meeting title received", }, status=200)

def showmeetings(request):
    if request.method=='GET':
        user=request.user
        events = CalendarEvent.objects.filter(user=user)
        events_data = []
        for event in events:
            events_data.append({
                'id': event.event_id,
                'title': event.title,
                'time': event.start_time.isoformat(),
                'date': event.date.isoformat(),
                'description': event.description,
                'folder': event.folder,
                'link' : event.link  # Google Calendar event ID
            })
        
        print(events_data)

        return JsonResponse({'events': events_data}, status=200)

def editevent(request,event_id):
    if request.method=="PUT":
        event= CalendarEvent.objects.get(event_id=event_id, user=request.user)

        data= json.loads(request.body)

        stime=data.get("time"," ").strip()
        sdate=data.get("date"," ").strip()

        naive_datetime = datetime.strptime(f"{sdate} {stime}", "%Y-%m-%d %H:%M")
        tz = pytz.timezone("Asia/Dhaka")
        aware_datetime = tz.localize(naive_datetime)
        start_iso = aware_datetime.isoformat()
        end_time = aware_datetime + timedelta(minutes=60)
        end_iso = end_time.isoformat()

        meeting_info ={
        "meeting_title" : data.get("title", " ").strip(),
        "meeting_date" : data.get("date"," ").strip(),
        "meeting_start_time" : start_iso,
        "meeting_end_time" : end_iso,
        "meeting_link" : data.get("link"," ").strip(),
        "meeting_folder" : data.get("folder", " ").strip(),
        "meeting_description" : data.get("description", " ").strip(),
        "meeting_folder" : data.get("folder", " ").strip(),
        }

        try: 
                update_google_calendar_event(event.event_id, request.user.email, meeting_info)

                event.title = data.get("title", " ").strip()
                event.start_time = start_iso
                event.end_time = end_iso
                event.description = data.get("description", " ").strip()
                event.folder =  data.get("folder", " ").strip()
                event.date = data.get("date"," ").strip()
                event.link = data.get("link"," ").strip()
                event.save()

                return JsonResponse({"message": "Event updated successfully"}, status=200)

        except Exception as e:
                print(f"Error updating event: {e}")
                return JsonResponse({"error": "Failed to update event"}, status=500)
        
def deleteevent(request,event_id):
    if request.method=="DELETE":
        try:
            event = CalendarEvent.objects.get(event_id=event_id, user=request.user)
            event.delete()
            delete_google_calendar_event(request.user.email,event_id)

            print("Event deleted successfully.")

            return JsonResponse({"message":"Event Deleted successfully"},status=200)
        except CalendarEvent.DoesNotExist:
            print("Event not found.")
        except Exception as e:
            print(f"Unexpected error deleting event: {e}")

            return JsonResponse({"error":"Failed to delete event"})

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




