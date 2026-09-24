from decimal import Decimal, ROUND_HALF_UP
from datetime import date
from django.db import models
from django.utils import timezone
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

class PayrollAdjustment(models.Model):
    """One row per employee per month, holding that month's deduction/bonus —
    separate from the static Payroll row, since these change month to month."""
    employee         = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='payroll_adjustments')
    year             = models.IntegerField()
    month            = models.IntegerField()  # 1–12
    deduction        = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    deduction_reason = models.CharField(max_length=255, blank=True)
    bonus            = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    updated_at       = models.DateTimeField(auto_now=True)
    updated_by       = models.CharField(max_length=100, blank=True)

    class Meta:
        unique_together = ('employee', 'year', 'month')

    def __str__(self):
        return f"{self.employee} {self.year}-{self.month:02d} — ded {self.deduction}, bonus {self.bonus}"


class LongTermDeduction(models.Model):
    """A deduction spread over several months — e.g. a loan or a salary advance.

    This is separate from PayrollAdjustment (the plain month-by-month deduction
    editable on the Payroll page): here HR sets a total amount, a reason and a
    number of months once, and each month's installment is worked out
    automatically and folded into that employee's payroll deduction for as
    long as the plan is active. HR can still add an *extra* one-off deduction
    on top for a given month the normal way — the two are independent and are
    only combined for display/total-pay purposes on the Payroll page.
    """

    STATUS_CHOICES = [
        ('active',    'Active'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]

    employee         = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='long_term_deductions')
    reason           = models.CharField(max_length=255)  # e.g. "Loan", "Salary advance"
    notes            = models.TextField(blank=True)
    total_amount     = models.DecimalField(max_digits=12, decimal_places=2)
    number_of_months = models.PositiveIntegerField()
    # total_amount / number_of_months, rounded — stored once at creation/edit so it
    # never silently drifts; the *last* installment absorbs any rounding remainder.
    monthly_amount   = models.DecimalField(max_digits=12, decimal_places=2)
    start_year       = models.IntegerField()
    start_month      = models.IntegerField()  # 1–12 — first month a deduction is taken
    status           = models.CharField(max_length=10, choices=STATUS_CHOICES, default='active')
    cancelled_at     = models.DateTimeField(null=True, blank=True)
    created_by       = models.CharField(max_length=100, blank=True)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)
    updated_by       = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.employee} — {self.reason} ({self.total_amount})"

    def _month_index(self, year, month):
        """0-based index of (year, month) relative to the schedule's start month.
        Negative before the plan starts; >= number_of_months after it ends."""
        return (year - self.start_year) * 12 + (month - self.start_month)

    def installment_for(self, year, month):
        """Amount due for this plan in a given (year, month). 0 outside the
        schedule, or for any month at/after cancellation."""
        idx = self._month_index(year, month)
        if idx < 0 or idx >= self.number_of_months:
            return Decimal('0.00')
        if self.status == 'cancelled':
            if idx >= self.elapsed_months:
                return Decimal('0.00')
        is_last_month = idx == self.number_of_months - 1
        if is_last_month:
            return self.total_amount - (self.monthly_amount * (self.number_of_months - 1))
        return self.monthly_amount

    @property
    def elapsed_months(self):
        """How many installments are considered applied so far, based on
        today's date (or the moment it was cancelled, if it was)."""
        if self.status == 'cancelled' and self.cancelled_at:
            cutoff_year, cutoff_month = self.cancelled_at.year, self.cancelled_at.month
        else:
            today = date.today()
            cutoff_year, cutoff_month = today.year, today.month
        idx = self._month_index(cutoff_year, cutoff_month) + 1  # this month counts as elapsed
        return max(0, min(idx, self.number_of_months))

    @property
    def total_paid(self):
        elapsed = self.elapsed_months
        if elapsed <= 0:
            return Decimal('0.00')
        if elapsed >= self.number_of_months:
            return self.total_amount
        return (self.monthly_amount * elapsed).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    @property
    def balance(self):
        return (self.total_amount - self.total_paid).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    @property
    def end_year_month(self):
        """(year, month) of the final installment."""
        total_index = self.number_of_months - 1
        year  = self.start_year + (self.start_month - 1 + total_index) // 12
        month = (self.start_month - 1 + total_index) % 12 + 1
        return year, month

    def save(self, *args, **kwargs):
        # Auto-complete once every installment has elapsed (unless cancelled).
        if self.status == 'active' and self.elapsed_months >= self.number_of_months:
            self.status = 'completed'
        if self.status == 'cancelled' and not self.cancelled_at:
            self.cancelled_at = timezone.now()
        super().save(*args, **kwargs)