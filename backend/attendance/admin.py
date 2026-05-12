from django.contrib import admin
from .models import Shift, AttendanceRecord

@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    list_display = ('name', 'start_time', 'end_time', 'working_days_per_month')

@admin.register(AttendanceRecord)
class AttendanceRecordAdmin(admin.ModelAdmin):
    list_display = ('employee', 'date', 'shift', 'status', 'marked_by')
    list_filter = ('status', 'shift', 'date')
    search_fields = ('employee__first_name', 'employee__last_name')