from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.core.cache import cache
from core.permissions import IsHOD, IsHRM
from .models import Shift, AttendanceRecord, WorkLocation
from .serializers import ShiftSerializer, AttendanceRecordSerializer, WorkLocationSerializer
from employees.models import Employee

# ── Cache keys & TTL ──────────────────────────────────────────────────────────
SHIFT_LIST_KEY    = 'shifts:list'
LOCATION_LIST_KEY = 'attendance:locations'
CACHE_TTL         = 300  # 5 minutes


class ShiftListView(generics.ListCreateAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class   = ShiftSerializer

    def get_queryset(self):
        return Shift.objects.all()

    def list(self, request, *args, **kwargs):
        cached = cache.get(SHIFT_LIST_KEY)
        if cached is not None:
            return Response(cached)
        response = super().list(request, *args, **kwargs)
        cache.set(SHIFT_LIST_KEY, response.data, CACHE_TTL)
        return response

    def perform_create(self, serializer):
        serializer.save()
        cache.delete(SHIFT_LIST_KEY)


class AttendanceListCreateView(generics.ListCreateAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class   = AttendanceRecordSerializer

    def get_queryset(self):
        user = self.request.user
        qs   = AttendanceRecord.objects.select_related('employee', 'shift')

        if user.role == 'HOD':
            qs = qs.filter(employee__department=user.department)

        date        = self.request.query_params.get('date')
        date_after  = self.request.query_params.get('date_after')
        date_before = self.request.query_params.get('date_before')
        employee    = self.request.query_params.get('employee')
        department  = self.request.query_params.get('department')

        if date:        qs = qs.filter(date=date)
        if date_after:  qs = qs.filter(date__gte=date_after)
        if date_before: qs = qs.filter(date__lte=date_before)
        if employee:    qs = qs.filter(employee_id=employee)
        if department:  qs = qs.filter(employee__department_id=department)

        return qs.order_by('-date')

    def perform_create(self, serializer):
        serializer.save(marked_by=self.request.user.username)

    def create(self, request, *args, **kwargs):
        if request.user.role not in ('HOD', 'HOD_ACCOUNTS', 'HRM'):
            return Response(
                {'error': 'You do not have permission to mark attendance.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().create(request, *args, **kwargs)


class AttendanceDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class   = AttendanceRecordSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role == 'HOD':
            return AttendanceRecord.objects.filter(employee__department=user.department)
        return AttendanceRecord.objects.all()


class WorkLocationListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/attendance/locations/  — returns all saved locations (sorted)
    POST /api/attendance/locations/  — adds a new location (case-insensitive dedup)
    """
    permission_classes = (IsAuthenticated,)
    serializer_class   = WorkLocationSerializer

    def get_queryset(self):
        return WorkLocation.objects.all()

    def list(self, request, *args, **kwargs):
        cached = cache.get(LOCATION_LIST_KEY)
        if cached is not None:
            return Response(cached)
        response = super().list(request, *args, **kwargs)
        cache.set(LOCATION_LIST_KEY, response.data, CACHE_TTL)
        return response

    def create(self, request, *args, **kwargs):
        raw = request.data.get('name', '').strip()
        if not raw:
            return Response({'error': 'name is required'}, status=status.HTTP_400_BAD_REQUEST)

        existing = WorkLocation.objects.filter(name__iexact=raw).first()
        if existing:
            return Response(WorkLocationSerializer(existing).data, status=status.HTTP_200_OK)

        obj = WorkLocation.objects.create(name=raw, created_by=request.user.username)
        cache.delete(LOCATION_LIST_KEY)
        return Response(WorkLocationSerializer(obj).data, status=status.HTTP_201_CREATED)
