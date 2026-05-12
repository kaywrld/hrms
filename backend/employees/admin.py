from django.contrib import admin
from .models import Department, Employee, AcademicQualification, EmployeeStatusLog

@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ('name', 'description')
    search_fields = ('name',)

@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ('employee_number', 'first_name', 'last_name', 'department', 'job_title', 'status')
    list_filter = ('status', 'department', 'employment_type', 'gender')
    search_fields = ('first_name', 'last_name', 'employee_number', 'national_id')

@admin.register(AcademicQualification)
class AcademicQualificationAdmin(admin.ModelAdmin):
    list_display = ('employee', 'level', 'institution', 'field_of_study', 'year_obtained')
    list_filter = ('level',)

@admin.register(EmployeeStatusLog)
class EmployeeStatusLogAdmin(admin.ModelAdmin):
    list_display = ('employee', 'old_status', 'new_status', 'changed_by', 'changed_at')
    readonly_fields = ('changed_at',)