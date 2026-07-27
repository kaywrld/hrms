from rest_framework import generics, status
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.core.cache import cache
from core.permissions import IsAccountsHOD, IsHRM, CanViewEmployees
from .models import Payroll
from .serializers import PayrollSerializer
from .models import Payroll, PayrollAdjustment
from .serializers import PayrollSerializer, PayrollAdjustmentSerializer
from rest_framework.permissions import IsAuthenticated

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
        cache.delete_pattern(f'{PAYROLL_LIST_KEY}:*')
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
        cache.delete_pattern(f'{PAYROLL_LIST_KEY}:*')
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
        cache.delete_pattern(f'{PAYROLL_LIST_KEY}:*')
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
