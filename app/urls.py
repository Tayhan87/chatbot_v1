from django.urls import path
from app import views

urlpatterns = [
    path('',views.index, name='index'),
    path('chat_api/', views.chat_api, name='chat_api'),
    path('login/',views.loginpage,name='login_page'),
    path("test/",views.test,name='test'),
    path('logut/',views.logout_view,name='logout'),
]
