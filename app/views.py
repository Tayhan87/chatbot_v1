from django.shortcuts import render,redirect
from django.contrib.auth import logout
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from app.models import Person,CalendarEvent
from datetime import timedelta, datetime
import json
import pytz

from google import genai
from chatbot_v1.drive import manage_folder,list_of_folders
from chatbot_v1.calendar import create_google_calendar_event

def index(request):
    if request.user.is_authenticated:
        return redirect('chatbot')
    else:
        return redirect('login_page')

@csrf_exempt
def chat_api(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        user_message = data.get('message', '')

        client = genai.Client(api_key="AIzaSyDYrY-2iOMeLPD6oTTupY4WJeffZQXc1f8")

        response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=user_message,
        )

        print(response.text)

        bot_response = response.text if response and hasattr(response, 'text') else "I'm not sure how to respond to that."

        return JsonResponse({'response': bot_response})
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
def signup(request):
    if request.method == "POST":
        print("Processing signup form")
        data= json.loads(request.body)
        username=data.get("name","").strip()
        password=data.get("password","")
        email=data.get("email","").strip().lower()

        if not username or not password or not email:
            return JsonResponse({"error": "All fields are required"}, status=400)
        
        check_mail = Person.objects.filter(email=email).exists()
        if check_mail:
            print("Email already exists")
            return JsonResponse({"error": "Email already exists",
                                 "code":"email_exists"
                                 }, status=409)
        
        person = Person.objects.create(
            username=username,
            email=email,
            password=password
        )
        return JsonResponse({"success": "User created successfully"},status=201)
    return render(request,"app/signup.html")

def eventadd(request):
    folders= list_of_folders(request.user.email)
    if not folders:
        print("No folders found for the user.")
        folders = []  # Ensure folders is always a list
    else:
        print(f"Found {len(folders)} folders for the user.")

    return render(request,"app/eventadd.html",{'folders': folders})



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
                'end_time': event.end_time.isoformat(),
                'date': event.date.isoformat(),
                'description': event.description,
                'folder': event.folder,
                'link' : event.link  # Google Calendar event ID
            })

        return JsonResponse({'events': events_data}, status=200)


