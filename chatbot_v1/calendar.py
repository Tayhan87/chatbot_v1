# You can place this in a utils.py file in your app, or directly in views.py
from allauth.socialaccount.models import SocialToken,SocialAccount
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from google.auth.transport.requests import Request
from django.conf import settings # To get your client_id and secret
from googleapiclient.errors import HttpError
import pytz
from datetime import datetime
from datetime import timedelta
from app.models import Person



def get_calendar_service(user):
    try:
        social_account = SocialAccount.objects.get(user=user, provider='google')
        social_token = SocialToken.objects.get(account=social_account)

        app=social_token.app
        client_id = app.client_id
        client_secret = app.secret

        creds= Credentials(
            token=social_token.token,
            refresh_token=social_token.token_secret,
            token_uri='https://oauth2.googleapis.com/token',
            client_id=client_id,
            client_secret=client_secret,
            scopes=settings.SOCIALACCOUNT_PROVIDERS['google']['SCOPE']
        )

        if creds.expired and creds.refresh_token:
            print("Credentials have expired. Attempting to refresh token.")
            creds.refresh(Request())

            social_token.token =  creds.token
            social_token.token_secret = creds.refresh_token
            social_token.expires_at = creds.expiry
            social_token.save()
            print("Token refreshed and saved successfully.")

        return build("calendar","v3",credentials=creds)

    except SocialToken.DoesNotExist:
        print(f"No Google token found for user {user.email}.")
        return None
    except Exception as e:
        print (f"An unexpected error occurred while building calendar service: {e}")





def create_google_calendar_event(email, meeting_info):
    """
    Create a Google Calendar event for a meeting
    
    Args:
        user: Django user object
        meeting_title: Title of the meeting
        start_time: datetime object for meeting start
        duration_minutes: Meeting duration in minutes
        timezone: Timezone string (default: 'UTC')
        description: Meeting description (optional)
        attendees: List of email addresses to invite (optional)
    
    Returns:
        Event ID if successful, None otherwise
    """
    # First get the calendar service
    user = Person.objects.get(email=email)

    service = get_calendar_service(user)
    if not service:
        return None

    try:
        naive_datetime = datetime.strptime(f"{meeting_info['meeting_date']} {meeting_info['meeting_time']}", "%Y-%m-%d %H:%M")
        tz = pytz.timezone("Asia/Dhaka")
        aware_datetime = tz.localize(naive_datetime)
        start_iso = aware_datetime.isoformat()
        end_time = aware_datetime + timedelta(minutes=60)
        end_iso = end_time.isoformat()
        
        # Create event body
        event = {
            'summary': meeting_info["meeting_title"],
            'description': meeting_info["meeting_description"],
            'start': {
                'dateTime': start_iso,
                'timeZone': "Asia/Dhaka",
            },
            'end': {
             'dateTime': end_iso,
             'timeZone': "Asia/Dhaka",
        },

           
            'reminders': {
                'useDefault': False,  # This disables default reminders
                'overrides': [
                {'method': 'popup', 'minutes': 60},  # Reminder 1 hour before
        ],
    },
        }
        
        # Create the event
        created_event = service.events().insert(
            calendarId='primary',
            body=event,
        ).execute()
        
        return created_event.get('id')
    
    except HttpError as error:
        print(f"Google API error occurred: {error}")
        return None
    except Exception as e:
        print(f"Unexpected error creating calendar event: {e}")
        return None