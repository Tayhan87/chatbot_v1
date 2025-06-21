from django.shortcuts import render,redirect
from django.contrib.auth import logout
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from app.models import Person,CalendarEvent,UploadedFile
from datetime import timedelta, datetime


import json
import pytz
import mimetypes

from google import genai
from chatbot_v1.drive import (
    manage_folder, list_of_folders, upload_file_from_memory, 
    get_folder_by_name, create_subfolder_if_not_exists, 
    list_files_in_folder, search_folder
)
from chatbot_v1.calendar import create_google_calendar_event , update_google_calendar_event , delete_google_calendar_event

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

        


def get_file_type_category(filename, mime_type):
    """Determine file type category based on filename and MIME type"""
    filename_lower = filename.lower()
    
    # Document types
    if any(ext in filename_lower for ext in ['.doc', '.docx', '.rtf', '.odt']):
        return 'document'
    
    # Image types
    if any(ext in filename_lower for ext in ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp']):
        return 'image'
    
    # Video types
    if any(ext in filename_lower for ext in ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv']):
        return 'video'
    
    # PDF
    if filename_lower.endswith('.pdf'):
        return 'pdf'
    
    # Text/HTML types
    if any(ext in filename_lower for ext in ['.txt', '.html', '.htm', '.md', '.markdown', '.css', '.js']):
        return 'text'
    
    # Check MIME type as fallback
    if mime_type:
        if mime_type.startswith('image/'):
            return 'image'
        elif mime_type.startswith('video/'):
            return 'video'
        elif mime_type == 'application/pdf':
            return 'pdf'
        elif mime_type.startswith('text/'):
            return 'text'
        elif mime_type.startswith('application/vnd.openxmlformats-officedocument.wordprocessingml'):
            return 'document'
    
    return 'other'

@login_required
def file_upload_page(request):
    """Render the file upload page"""
    try:
        # Get user's folders
        folders = list_of_folders(request.user.email)
        if not folders:
            # Create default folders if none exist
            manage_folder(request.user.email)
            folders = list_of_folders(request.user.email)
        
        # Get main folder
        main_folder = search_folder(request.user, "Mercy Of Allah")
        
        context = {
            'folders': folders,
            'main_folder': main_folder
        }
        
        return render(request, 'app/file_upload.html', context)
    except Exception as e:
        print(f"Error loading file upload page: {e}")
        return render(request, 'app/file_upload.html', {'folders': [], 'error': str(e)})

@csrf_exempt
@login_required
def upload_file(request):
    """Handle file upload to Google Drive"""
    if request.method == 'POST':
        try:
            # Check if file was uploaded
            if 'file' not in request.FILES:
                return JsonResponse({'error': 'No file provided'}, status=400)
            
            uploaded_file = request.FILES['file']
            folder_name = request.POST.get('folder', '').strip()
            
            if not folder_name:
                return JsonResponse({'error': 'Folder name is required'}, status=400)
            
            # Get main folder
            main_folder = search_folder(request.user, "Mercy Of Allah")
            if not main_folder:
                return JsonResponse({'error': 'Main folder not found. Please log in again.'}, status=400)
            
            # Get or create subfolder
            subfolder_id = create_subfolder_if_not_exists(
                request.user, 
                folder_name, 
                main_folder['id']
            )
            
            if not subfolder_id:
                return JsonResponse({'error': 'Failed to create or find folder'}, status=400)
            
            # Get MIME type
            mime_type = uploaded_file.content_type or mimetypes.guess_type(uploaded_file.name)[0]
            
            # Upload file to Google Drive
            file_info = upload_file_from_memory(
                user=request.user,
                file_content=uploaded_file.read(),
                filename=uploaded_file.name,
                folder_id=subfolder_id,
                mime_type=mime_type
            )
            
            if not file_info:
                return JsonResponse({'error': 'Failed to upload file to Google Drive'}, status=500)
            
            # Determine file type category
            file_type = get_file_type_category(uploaded_file.name, mime_type)
            
            # Get file size and convert to integer
            file_size_str = file_info.get('size')
            file_size_int = int(file_size_str) if file_size_str is not None else None

            # Save file record to database
            uploaded_file_record = UploadedFile.objects.create(
                user=request.user,
                file_id=file_info['id'],
                filename=file_info['name'],
                original_filename=uploaded_file.name,
                mime_type=mime_type or 'application/octet-stream',
                file_size=file_size_int,
                folder_id=subfolder_id,
                folder_name=folder_name,
                web_view_link=file_info.get('webViewLink'),
                file_type=file_type,
                created_time=datetime.fromisoformat(file_info['createdTime'].replace('Z', '+00:00')) if file_info.get('createdTime') else None
            )
            
            return JsonResponse({
                'success': True,
                'message': 'File uploaded successfully',
                'file': {
                    'id': uploaded_file_record.id,
                    'name': uploaded_file_record.filename,
                    'size': uploaded_file_record.get_file_size_display(),
                    'type': uploaded_file_record.get_file_type_display_name(),
                    'folder': folder_name,
                    'uploaded_at': uploaded_file_record.uploaded_at.isoformat(),
                    'web_view_link': uploaded_file_record.web_view_link
                }
            })
            
        except Exception as e:
            print(f"Error uploading file: {e}")
            return JsonResponse({'error': f'Upload failed: {str(e)}'}, status=500)
    
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@login_required
def list_uploaded_files(request):
    """List all uploaded files for the user"""
    try:
        files = UploadedFile.objects.filter(user=request.user)
        
        files_data = []
        for file in files:
            files_data.append({
                'id': file.id,
                'name': file.filename,
                'original_name': file.original_filename,
                'size': file.get_file_size_display(),
                'type': file.get_file_type_display_name(),
                'folder': file.folder_name,
                'uploaded_at': file.uploaded_at.isoformat(),
                'web_view_link': file.web_view_link,
                'mime_type': file.mime_type
            })
        
        return JsonResponse({'files': files_data})
        
    except Exception as e:
        print(f"Error listing files: {e}")
        return JsonResponse({'error': 'Failed to list files'}, status=500)

@csrf_exempt
@login_required
def delete_uploaded_file(request, file_id):
    """Delete an uploaded file from both Google Drive and database"""
    if request.method == 'DELETE':
        try:
            # Get file record
            file_record = UploadedFile.objects.get(id=file_id, user=request.user)
            
            # Delete from Google Drive (functionality for future use)
            
            
            # Delete from database # For now, we'll just delete from database
            file_record.delete()
            
            return JsonResponse({'success': True, 'message': 'File deleted successfully'})
            
        except UploadedFile.DoesNotExist:
            return JsonResponse({'error': 'File not found'}, status=404)
        except Exception as e:
            print(f"Error deleting file: {e}")
            return JsonResponse({'error': 'Failed to delete file'}, status=500)
    
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@login_required
def get_folder_files(request, folder_name):
    """Get files from a specific folder"""
    try:
        # Get main folder
        main_folder = search_folder(request.user, "Mercy Of Allah")
        if not main_folder:
            return JsonResponse({'error': 'Main folder not found'}, status=400)
        
        # Get subfolder
        subfolder = get_folder_by_name(request.user, folder_name, main_folder['id'])
        if not subfolder:
            return JsonResponse({'error': 'Folder not found'}, status=404)
        
        # Get files from Google Drive
        drive_files = list_files_in_folder(request.user, subfolder['id'])
        
        # Get files from database for this folder
        db_files = UploadedFile.objects.filter(
            user=request.user, 
            folder_name=folder_name
        )
        
        # Combine and format data
        files_data = []
        
        # Add database files
        for file in db_files:
            files_data.append({
                'id': file.id,
                'name': file.filename,
                'size': file.get_file_size_display(),
                'type': file.get_file_type_display_name(),
                'uploaded_at': file.uploaded_at.isoformat(),
                'web_view_link': file.web_view_link,
                'source': 'database'
            })
        
        # Add Google Drive files that might not be in database
        for file in drive_files:
            # Check if file is already in database
            if not any(f['name'] == file['name'] for f in files_data):
                files_data.append({
                    'id': file['id'],
                    'name': file['name'],
                    'size': f"{int(file.get('size', 0)) / 1024:.1f} KB" if file.get('size') else 'Unknown',
                    'type': 'Unknown',
                    'uploaded_at': file.get('createdTime', ''),
                    'web_view_link': file.get('webViewLink'),
                    'source': 'drive'
                })
        
        return JsonResponse({'files': files_data})
        
    except Exception as e:
        print(f"Error getting folder files: {e}")
        return JsonResponse({'error': 'Failed to get folder files'}, status=500)


