from django.shortcuts import render,redirect
from django.contrib.auth import logout
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from app.models import Person
import json
from app.models import GoogleDriveToken
from google import genai
from api.demo import manage_folder

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

        # Dummy reply (replace with OpenAI call)
        bot_response = response.text if response and hasattr(response, 'text') else "I'm not sure how to respond to that."

        return JsonResponse({'response': bot_response})
    return JsonResponse({'error': 'Invalid request'}, status=400)


# def index(request):
#     print("Rendering index page")
#     return render(request, 'app/index.html')

def loginpage(request):
    return render(request,"app/loginpage.html")

@login_required
def chatbot(request):
    print("Rendering chatbot page")
    email=request.user.email
    manage_folder(email)
    return render(request, 'app/chatbot.html')

def test(request):
    return render(request,"app/test.html")

@csrf_exempt
def signout(request):
    if request.method == "POST":
        logout(request)
        return JsonResponse({"message":"Grant to Logout"}, status=200)


def logout_view(request):
    logout(request)
    return redirect("login_page")

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