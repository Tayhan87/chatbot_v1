from django.shortcuts import render,redirect
from django.contrib.auth import logout
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
import json
from google import genai

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


def index(request):
    print("Rendering index page")
    return render(request, 'app/index.html')

def loginpage(request):
    return render(request,"app/loginpage.html")

def test(request):
    return render(request,"app/test.html")

def logout_view(request):
    logout(request)
    return redirect("/")