from collections import defaultdict
from calendar import monthrange
from datetime import date
from decimal import Decimal

from rest_framework import generics, status, views
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.core.cache import cache
from core.permissions import IsAccountsHOD, IsHRM, CanViewEmployees
from core.cache_utils import bust_cache_pattern
from .models import Payroll
from .serializers import PayrollSerializer
from .models import Payroll, PayrollAdjustment, LongTermDeduction
from .serializers import PayrollSerializer, PayrollAdjustmentSerializer, LongTermDeductionSerializer
from .payroll_calc import get_working_days_in_month, tally_attendance, compute_payroll_row
from rest_framework.permissions import IsAuthenticated
from employees.models import Employee
from attendance.models import AttendanceRecord

# ── Cache helpers ─────────────────────────────────────────────────────────────
PAYROLL_LIST_KEY = 'payroll:list'
CACHE_TTL        = 300  # 5 minutes


def _payroll_list_key(user):
    """Scope the cache key so HOD users never see another department's data."""
    if user.role == 'HOD':
        return f'{PAYROLL_LIST_KEY}:hod:{user.pk}'
    return f'{PAYROLL_LIST_KEY}:all'


class PayrollListCreateView(generics.ListCreateAPIView):
    permission_classes = (CanViewEmployees,)
    serializer_class   = PayrollSerializer

    def get_queryset(self):
        user = self.request.user
        qs   = Payroll.objects.select_related('employee')
        if user.role == 'HOD':
            qs = qs.filter(employee__department=user.department)
        return qs

    def list(self, request, *args, **kwargs):
        key = _payroll_list_key(request.user)
        cached = cache.get(key)
        if cached is not None:
            return Response(cached)
        response = super().list(request, *args, **kwargs)
        cache.set(key, response.data, CACHE_TTL)
        return response

    def create(self, request, *args, **kwargs):
        if request.user.role not in ('HRM', 'HOD_ACCOUNTS'):
            return Response(
                {'error': 'You do not have permission to create payroll records.'},
                status=status.HTTP_403_FORBIDDEN
            )
        response = super().create(request, *args, **kwargs)
        bust_cache_pattern(f'{PAYROLL_LIST_KEY}:*')
        return response

    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user.username)


class PayrollDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = (CanViewEmployees,)
    serializer_class   = PayrollSerializer

    def get_queryset(self):
        return Payroll.objects.select_related('employee').all()

    def update(self, request, *args, **kwargs):
        if request.user.role not in ('HRM', 'HOD_ACCOUNTS'):
            return Response(
                {'error': 'You do not have permission to edit payroll.'},
                status=status.HTTP_403_FORBIDDEN
            )
        response = super().update(request, *args, **kwargs)
        bust_cache_pattern(f'{PAYROLL_LIST_KEY}:*')
        return response

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user.username)


class PayrollByEmployeeView(generics.RetrieveUpdateAPIView):
    """
    GET/PATCH /api/payroll/employee/<employee_id>/
    Looks up a payroll record by the employee's primary key (not the payroll record pk).
    Returns 404 if no payroll record exists for that employee yet.
    """
    permission_classes = (CanViewEmployees,)
    serializer_class   = PayrollSerializer

    def get_object(self):
        employee_id = self.kwargs['employee_id']
        return get_object_or_404(
            Payroll.objects.select_related('employee'),
            employee__id=employee_id
        )

    def update(self, request, *args, **kwargs):
        if request.user.role not in ('HRM', 'HOD_ACCOUNTS'):
            return Response(
                {'error': 'You do not have permission to edit payroll.'},
                status=status.HTTP_403_FORBIDDEN
            )
        response = super().update(request, *args, **kwargs)
        bust_cache_pattern(f'{PAYROLL_LIST_KEY}:*')
        return response

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user.username)

class PayrollAdjustmentListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/payroll-adjustments/?year=2026&month=7  — that month's adjustments
    POST /api/payroll-adjustments/                    — upsert (create or update)
         body: { employee, year, month, deduction, deduction_reason, bonus }
    """
    permission_classes = (IsAuthenticated,)
    serializer_class   = PayrollAdjustmentSerializer

    def get_queryset(self):
        qs    = PayrollAdjustment.objects.all()
        year  = self.request.query_params.get('year')
        month = self.request.query_params.get('month')
        if year:  qs = qs.filter(year=year)
        if month: qs = qs.filter(month=month)
        return qs

    def create(self, request, *args, **kwargs):
        employee_id = request.data.get('employee')
        year        = request.data.get('year')
        month       = request.data.get('month')
        if not (employee_id and year and month):
            return Response({'error': 'employee, year and month are required'}, status=status.HTTP_400_BAD_REQUEST)

        obj, _ = PayrollAdjustment.objects.update_or_create(
            employee_id=employee_id, year=year, month=month,
            defaults={
                'deduction':        request.data.get('deduction', 0) or 0,
                'deduction_reason': request.data.get('deduction_reason', ''),
                'bonus':            request.data.get('bonus', 0) or 0,
                'updated_by':       request.user.username,
            }
        )
        return Response(self.get_serializer(obj).data, status=status.HTTP_200_OK)


class LongTermDeductionListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/payroll/long-term-deductions/?employee=<id>&status=active&year=2026&month=7
         — list loan/advance plans. Pass year+month to also get each plan's
           installment_this_month (what it contributes to that month's deduction).
    POST /api/payroll/long-term-deductions/
         body: { employee, reason, notes, total_amount, number_of_months, start_year, start_month }
    """
    permission_classes = (CanViewEmployees,)
    serializer_class   = LongTermDeductionSerializer

    def get_queryset(self):
        user = self.request.user
        qs   = LongTermDeduction.objects.select_related('employee')
        if user.role == 'HOD':
            qs = qs.filter(employee__department=user.department)
        employee_id  = self.request.query_params.get('employee')
        status_param = self.request.query_params.get('status')
        if employee_id:  qs = qs.filter(employee_id=employee_id)
        if status_param: qs = qs.filter(status=status_param)
        return qs

    def create(self, request, *args, **kwargs):
        if request.user.role not in ('HRM', 'HOD_ACCOUNTS'):
            return Response(
                {'error': 'You do not have permission to create long-term deductions.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user.username, updated_by=self.request.user.username)


class LongTermDeductionDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/payroll/long-term-deductions/<id>/
    PATCH  /api/payroll/long-term-deductions/<id>/   — edit a plan, or cancel it (status: 'cancelled')
    DELETE /api/payroll/long-term-deductions/<id>/   — remove it entirely
    """
    permission_classes = (CanViewEmployees,)
    serializer_class   = LongTermDeductionSerializer
    queryset           = LongTermDeduction.objects.select_related('employee').all()

    def update(self, request, *args, **kwargs):
        if request.user.role not in ('HRM', 'HOD_ACCOUNTS'):
            return Response(
                {'error': 'You do not have permission to edit long-term deductions.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().update(request, *args, **kwargs)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user.username)

    def destroy(self, request, *args, **kwargs):
        if request.user.role not in ('HRM', 'HOD_ACCOUNTS'):
            return Response(
                {'error': 'You do not have permission to delete long-term deductions.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().destroy(request, *args, **kwargs)


# ── Computed, paginated payroll rows ───────────────────────────────────────
# GET /api/payroll/computed/?year=2026&month=9&page=1&page_size=50
#     &search=&department=all&site=all&status=all&pay_type=all
#
# Replaces the old pattern (used to be duplicated in 3 frontend files) of
# fetching every employee + every attendance record for the month + every
# adjustment + every long-term deduction, then computing net pay for all of
# them in the browser. That computation now happens once here; the browser
# only ever receives one page of already-computed rows, plus summary
# aggregates for the whole filtered set (so totals/averages stay accurate
# even though only one page of raw rows is sent).
#
# See payroll_calc.py for the calculation itself — it's a direct port of
# the JS that used to live in PayrollPage.jsx / PayslipsPage.jsx /
# MDPortal/PayrollPage.jsx, so results should match exactly what those
# pages showed before. Compare a real month's numbers against the old page
# before relying on this for real payroll.
class PayrollComputedListView(views.APIView):
    permission_classes = (CanViewEmployees,)

    @staticmethod
    def _payroll_or_none(emp):
        try:
            return emp.payroll
        except Payroll.DoesNotExist:
            return None

    def get(self, request):
        params = request.query_params
        try:
            year = int(params.get('year'))
            month = int(params.get('month'))  # 1–12
        except (TypeError, ValueError):
            return Response({'error': 'year and month are required integers.'}, status=status.HTTP_400_BAD_REQUEST)
        if not (1 <= month <= 12):
            return Response({'error': 'month must be between 1 and 12.'}, status=status.HTTP_400_BAD_REQUEST)
        month0 = month - 1

        user = request.user
        employees_qs = Employee.objects.select_related('department', 'site', 'payroll')
        if user.role == 'HOD':
            employees_qs = employees_qs.filter(department=user.department)

        department_param = params.get('department')
        if department_param and department_param != 'all':
            employees_qs = employees_qs.filter(department_id=department_param)
        site_param = params.get('site')
        if site_param and site_param != 'all':
            employees_qs = employees_qs.filter(site_id=site_param)

        employees = list(employees_qs.order_by('first_name', 'last_name'))
        employee_ids = [e.id for e in employees]

        working_days = get_working_days_in_month(year, month0)
        days_in_month = monthrange(year, month)[1]
        month_start = date(year, month, 1)
        month_end = date(year, month, days_in_month)

        att_by_emp = defaultdict(list)
        for rec in AttendanceRecord.objects.filter(
            employee_id__in=employee_ids, date__gte=month_start, date__lte=month_end
        ).values('employee_id', 'date', 'status'):
            att_by_emp[rec['employee_id']].append((rec['date'].isoformat(), rec['status']))

        adj_by_emp = {
            a.employee_id: a
            for a in PayrollAdjustment.objects.filter(employee_id__in=employee_ids, year=year, month=month)
        }

        loan_by_emp = defaultdict(lambda: {'amount': Decimal('0'), 'items': []})
        for ltd in LongTermDeduction.objects.filter(employee_id__in=employee_ids).select_related('employee'):
            amt = ltd.installment_for(year, month)
            if amt and amt > 0:
                loan_by_emp[ltd.employee_id]['amount'] += amt
                loan_by_emp[ltd.employee_id]['items'].append(
                    {'id': ltd.id, 'reason': ltd.reason, 'amount': str(amt)}
                )

        rows = []
        total_days_attended = 0.0
        for emp in employees:
            payroll = self._payroll_or_none(emp)
            normal_days, all_days, extra_credit = tally_attendance(att_by_emp.get(emp.id, []))
            adj = adj_by_emp.get(emp.id)
            loan = loan_by_emp.get(emp.id, {'amount': Decimal('0'), 'items': []})

            calc = compute_payroll_row(
                payroll=payroll,
                working_days=working_days,
                normal_days_attended=normal_days,
                extra_day_credit=extra_credit,
                all_days_attended=all_days,
                manual_deduction=adj.deduction if adj else Decimal('0'),
                loan_deduction=loan['amount'],
                bonus=adj.bonus if adj else Decimal('0'),
            )
            total_days_attended += calc['days_attended']

            full_name = " ".join(filter(None, [emp.first_name, emp.middle_name, emp.last_name])) or "—"
            rows.append({
                'employee_id': emp.id,
                'employee_number': emp.employee_number,
                'first_name': emp.first_name,
                'middle_name': emp.middle_name,
                'last_name': emp.last_name,
                'address': emp.address,
                'full_name': full_name,
                'job_title': emp.job_title or '—',
                'department': emp.department_id,
                'department_name': emp.department.name if emp.department_id else '—',
                'site': emp.site_id,
                'site_name': emp.site.name if emp.site_id else '—',
                'status': emp.status,
                'payroll_id': payroll.id if payroll else None,
                'currency': payroll.currency if payroll else 'USD',
                'bank_name_usd': payroll.bank_name_usd if payroll else '',
                'bank_account_usd': payroll.bank_account_usd if payroll else '',
                'bank_name_zig': payroll.bank_name_zig if payroll else '',
                'bank_account_zig': payroll.bank_account_zig if payroll else '',
                'deduction_reason': adj.deduction_reason if adj else '',
                'loan_items': loan['items'],
                **calc,
            })

        search = (params.get('search') or '').strip().lower()
        status_param = params.get('status')
        pay_type_param = params.get('pay_type')

        def matches(row):
            if search:
                haystack = f"{row['full_name']} {row['job_title']} {row['department_name']}".lower()
                if search not in haystack:
                    return False
            if status_param and status_param != 'all' and row['status'] != status_param:
                return False
            if pay_type_param and pay_type_param != 'all':
                if row['is_daily'] != (pay_type_param == 'daily'):
                    return False
            # An employee who is no longer active only shows up if they
            # actually have recorded attendance for the viewed month.
            if row['status'] and row['status'] != 'employed' and row['days_attended'] <= 0:
                return False
            return True

        filtered_rows = [r for r in rows if matches(r)]

        aggregates = {
            'total_employees': len(rows),
            'monthly_count': sum(1 for r in rows if not r['is_daily']),
            'daily_count': sum(1 for r in rows if r['is_daily']),
            'filtered_count': len(filtered_rows),
            'total_net_payable': sum(r['final_pay'] for r in filtered_rows),
            'total_deductions': sum(r['deduction'] for r in filtered_rows),
            'total_bonuses': sum(r['bonus'] for r in filtered_rows),
            'total_base_salary': sum(r['monthly_salary'] for r in filtered_rows),
            'total_net_salary': sum(r['net_salary'] for r in filtered_rows),
            'avg_attendance': round(total_days_attended / len(rows), 1) if rows else 0,
            'working_days': working_days,
            'days_in_month': days_in_month,
        }

        try:
            page = max(1, int(params.get('page', 1)))
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = int(params.get('page_size', 50))
        except (TypeError, ValueError):
            page_size = 50
        page_size = max(1, min(page_size, 500))

        start = (page - 1) * page_size
        total_pages = max(1, (len(filtered_rows) + page_size - 1) // page_size)

        return Response({
            'count': len(filtered_rows),
            'page': page,
            'page_size': page_size,
            'total_pages': total_pages,
            'results': filtered_rows[start:start + page_size],
            'aggregates': aggregates,
        })