from django.db import models
from employees.models import Employee, Department

class Shift(models.Model):
    SHIFT_CHOICES = [
        ('standard', 'Standard (Mon–Fri, 8am–5pm)'),
        ('security', 'Security (1pm–1am, 20 days/month)'),
    ]
    name            = models.CharField(max_length=50, choices=SHIFT_CHOICES, unique=True)
    start_time      = models.TimeField()
    end_time        = models.TimeField()
    working_days_per_month = models.PositiveIntegerField(help_text='21 for standard, 20 for security')

    def __str__(self):
        return self.get_name_display()


class AttendanceRecord(models.Model):
    STATUS_CHOICES = [
        ('present',  'Present'),
        ('absent',   'Absent'),
        ('late',     'Late'),
        ('half_day', 'Half Day'),
        ('leave',    'On Leave'),
    ]

    employee       = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='attendance')
    date           = models.DateField()
    shift          = models.ForeignKey(Shift, on_delete=models.SET_NULL, null=True)
    status         = models.CharField(max_length=20, choices=STATUS_CHOICES)
    marked_by      = models.CharField(max_length=100)  # AdminUser username
    notes          = models.TextField(blank=True)
    arrival_time   = models.CharField(max_length=10, blank=True, help_text='Time of arrival for late arrivals, e.g. 09:35')
    absence_reason = models.CharField(max_length=255, blank=True, help_text='Reason for absence')
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('employee', 'date')  # one record per employee per day

    def __str__(self):
        return f"{self.employee} | {self.date} | {self.status}"