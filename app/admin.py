from django.contrib import admin
from app.models import Person, CalendarEvent


# Register your models here.
admin.site.register(Person)
admin.site.register(CalendarEvent)
