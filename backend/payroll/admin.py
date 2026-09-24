from django.contrib import admin
from .models import Payroll, LongTermDeduction

@admin.register(Payroll)
class PayrollAdmin(admin.ModelAdmin):
    list_display = ('employee', 'pay_type', 'basic_salary', 'daily_rate', 'allowances', 'deductions', 'net_salary', 'currency', 'updated_by')
    search_fields = ('employee__first_name', 'employee__last_name')


@admin.register(LongTermDeduction)
class LongTermDeductionAdmin(admin.ModelAdmin):
    list_display = ('employee', 'reason', 'total_amount', 'monthly_amount', 'number_of_months',
                     'start_year', 'start_month', 'status', 'total_paid', 'balance', 'updated_by')
    list_filter  = ('status',)
    search_fields = ('employee__first_name', 'employee__last_name', 'reason')