from django.contrib import admin
from .models import Payroll

@admin.register(Payroll)
class PayrollAdmin(admin.ModelAdmin):
    list_display = ('employee', 'pay_type', 'basic_salary', 'daily_rate', 'allowances', 'deductions', 'net_salary', 'currency', 'updated_by')
    search_fields = ('employee__first_name', 'employee__last_name')