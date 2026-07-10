from django.db import models
from employees.models import Employee

class Payroll(models.Model):
    PAY_TYPE_CHOICES = [
        ('monthly', 'Monthly Salary'),
        ('daily',   'Daily Rate'),
    ]

    employee        = models.OneToOneField(Employee, on_delete=models.CASCADE, related_name='payroll')
    pay_type        = models.CharField(max_length=10, choices=PAY_TYPE_CHOICES, default='monthly')
    # ── Monthly-salary employees: fixed basic_salary, pro-rated against working days in the month ──
    basic_salary    = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    # ── Daily-rate employees: no fixed salary — paid rate × days actually worked (any day, incl. weekends) ──
    daily_rate      = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    allowances      = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    deductions      = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    # ── USD bank account on file ──
    bank_name_usd    = models.CharField(max_length=100, blank=True)
    bank_account_usd = models.CharField(max_length=50, blank=True)
    # ── ZiG (ZWG) bank account on file — kept separate from the USD account ──
    bank_name_zig    = models.CharField(max_length=100, blank=True)
    bank_account_zig = models.CharField(max_length=50, blank=True)
    currency        = models.CharField(max_length=10, default='USD')
    updated_at      = models.DateTimeField(auto_now=True)
    updated_by      = models.CharField(max_length=100)  # AdminUser username

    @property
    def net_salary(self):
        base = self.basic_salary if self.pay_type == 'monthly' else self.daily_rate
        base = base or 0
        return base + self.allowances - self.deductions

    def __str__(self):
        return f"{self.employee} — Net: {self.net_salary} {self.currency}"