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
    path('editevent/<str:event_id>/', views.editevent, name='editevent'),
    path('deleteevent/<str:event_id>/',views.deleteevent, name='deleteevent'),
    path('folderList/',views.folderList,name="folderList"),

    path('file-upload/', views.file_upload_page, name='file_upload_page'),
    path('upload-file/', views.upload_file, name='upload_file'),
    path('list-files/', views.list_uploaded_files, name='list_uploaded_files'),
    path('delete-file/<int:file_id>/', views.delete_uploaded_file, name='delete_uploaded_file'),
    path('folder-files/<str:folder_name>/', views.get_folder_files, name='get_folder_files'),
]
