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
    path('showmeeting/', views.showmeetings, name='showmeeting'),
    path('editevent/<int:id>/', views.editevent, name='editevent'),
    path('deleteevent/<int:id>/',views.deleteevent, name='deleteevent'),
    path('folderList/',views.folderList,name="folderList"),
    path('checklogin/',views.checklogin,name='checklogin'),
    path('is_google_user/', views.is_google_user, name='is_google_user'),
    path('google-picker-config/', views.google_picker_config, name='google_picker_config'),
    path('update_today_meeting_folder/', views.update_today_meeting_folder, name='update_today_meeting_folder'),
    path('update_meeting_folder/', views.update_meeting_folder, name='update_meeting_folder'),
    path('upload_folder/', views.upload_folder, name='upload_folder'),
    path('api/userinfo/', views.userinfo, name='userinfo'),#added by sumon
]
