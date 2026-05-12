from django.db import models
from employees.models import Employee

class Payroll(models.Model):
    employee        = models.OneToOneField(Employee, on_delete=models.CASCADE, related_name='payroll')
    basic_salary    = models.DecimalField(max_digits=10, decimal_places=2)
    allowances      = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    deductions      = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    bank_name       = models.CharField(max_length=100, blank=True)
    bank_account    = models.CharField(max_length=50, blank=True)
    currency        = models.CharField(max_length=10, default='USD')
    updated_at      = models.DateTimeField(auto_now=True)
    updated_by      = models.CharField(max_length=100)  # AdminUser username

    @property
    def net_salary(self):
        return self.basic_salary + self.allowances - self.deductions

    def __str__(self):
        return f"{self.employee} — Net: {self.net_salary} {self.currency}"