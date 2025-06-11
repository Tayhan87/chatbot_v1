from django.urls import path
from app import views

urlpatterns = [
     path('',views.index, name='index'),
    path('chat_api/', views.chat_api, name='chat_api'),
    path('login/',views.loginpage,name='login_page'),
    path("signout/",views.signout,name='signout'),
    path('chatbot/', views.chatbot, name='chatbot'),
    path('signup/', views.signup, name='signup'),
    path('eventadd/',views.eventadd, name='eventadd'),
    path('mngmeeting/', views.mngmeeting, name='mngmeeting'),
    path('setmeeting/', views.setmeeting, name='setmeeting'),
]
