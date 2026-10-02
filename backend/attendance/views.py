from rest_framework import generics, status
from rest_framework.views import APIView
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
        employee_ids = self.request.query_params.get('employee_ids')  # comma-separated
        department  = self.request.query_params.get('department')

        if date:        qs = qs.filter(date=date)
        if date_after:  qs = qs.filter(date__gte=date_after)
        if date_before: qs = qs.filter(date__lte=date_before)
        if employee:    qs = qs.filter(employee_id=employee)
        if employee_ids:
            ids = [i for i in employee_ids.split(',') if i.strip().isdigit()]
            qs = qs.filter(employee_id__in=ids)
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


class AttendanceDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class   = AttendanceRecordSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role == 'HOD':
            return AttendanceRecord.objects.filter(employee__department=user.department)
        return AttendanceRecord.objects.all()

    def destroy(self, request, *args, **kwargs):
        if request.user.role not in ('HOD', 'HOD_ACCOUNTS', 'HRM'):
            return Response(
                {'error': 'You do not have permission to unmark attendance.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().destroy(request, *args, **kwargs)


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

# ── Mark Register (month grid) ────────────────────────────────────────────────
# The Mark Register page used to download every full attendance record for the
# month through the generic list endpoint (serializer, pagination, 20+ fields
# per record) and then rebuild "who is marked on which day" and "which site did
# each person work at most" in the browser. These two endpoints do that work
# on the server and send back only what the grid actually needs.

REGISTER_MAX_BULK = 10000


def _month_bounds(year, month):
    import calendar
    from datetime import date
    last = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last)


class RegisterMonthView(APIView):
    """
    GET /api/attendance/register/?year=2026&month=10   (month is 1-12)

    {
      "records":       { "<employee_id>": { "YYYY-MM-DD": {"id": 1, "status": "present"} } },
      "site_defaults": { "<employee_id>": "Most common work_location this month" }
    }
    """
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        try:
            year  = int(request.query_params.get('year', ''))
            month = int(request.query_params.get('month', ''))
            if not (1 <= month <= 12 and 1900 <= year <= 3000):
                raise ValueError
        except ValueError:
            return Response({'error': 'year and month (1-12) are required.'},
                            status=status.HTTP_400_BAD_REQUEST)

        first, last = _month_bounds(year, month)
        qs = AttendanceRecord.objects.filter(date__gte=first, date__lte=last)
        if request.user.role == 'HOD':
            qs = qs.filter(employee__department=request.user.department)

        records = {}
        site_counts = {}
        # .values_list: plain tuples straight from the DB — no model instances,
        # no serializer, no joins.
        for rec_id, emp_id, rec_date, rec_status, loc in qs.values_list(
                'id', 'employee_id', 'date', 'status', 'work_location'):
            records.setdefault(emp_id, {})[rec_date.isoformat()] = {'id': rec_id, 'status': rec_status}
            loc = (loc or '').strip()
            if loc:
                counts = site_counts.setdefault(emp_id, {})
                counts[loc] = counts.get(loc, 0) + 1

        site_defaults = {
            emp_id: max(counts.items(), key=lambda kv: kv[1])[0]
            for emp_id, counts in site_counts.items()
        }
        return Response({'records': records, 'site_defaults': site_defaults})


class RegisterBulkMarkView(APIView):
    """
    POST /api/attendance/register/bulk/
    {
      "status": "present",                      # optional, default "present"
      "records": [ {"employee": 5, "date": "2026-10-01", "work_location": "Masons"}, ... ]
    }

    Marks many employee-days in a single request (one transaction, a handful of
    queries) instead of one HTTP request per cell. Days that are already on
    record are NEVER overwritten — they come back under "skipped" so a status a
    HOD set on purpose (leave, absent, ...) can't be flipped to Present by a
    bulk click.

    Response:
      saved    [{id, employee, date, status}]   newly created
      skipped  [{id, employee, date, status}]   already marked, left untouched
      rejected [{employee, date, reason}]       not allowed / invalid
    """
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        from datetime import date as date_cls
        from django.db import transaction

        user = request.user
        if user.role not in ('HOD', 'HOD_ACCOUNTS', 'HRM'):
            return Response({'error': 'You do not have permission to mark attendance.'},
                            status=status.HTTP_403_FORBIDDEN)

        new_status = request.data.get('status', 'present')
        if new_status not in dict(AttendanceRecord.STATUS_CHOICES):
            return Response({'error': 'Invalid status.'}, status=status.HTTP_400_BAD_REQUEST)

        items = request.data.get('records')
        if not isinstance(items, list) or not items:
            return Response({'error': 'records must be a non-empty list.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if len(items) > REGISTER_MAX_BULK:
            return Response({'error': f'Too many records in one request (max {REGISTER_MAX_BULK}).'},
                            status=status.HTTP_400_BAD_REQUEST)

        rejected, wanted = [], {}   # wanted: (employee_id, date) -> work_location
        for item in items:
            try:
                emp_id = int(item.get('employee'))
                day = date_cls.fromisoformat(str(item.get('date')))
            except (TypeError, ValueError, AttributeError):
                rejected.append({'employee': item.get('employee') if isinstance(item, dict) else None,
                                 'date': item.get('date') if isinstance(item, dict) else None,
                                 'reason': 'invalid employee or date'})
                continue
            loc = str(item.get('work_location') or '').strip()[:255]
            wanted.setdefault((emp_id, day), loc)

        if not wanted:
            return Response({'saved': [], 'skipped': [], 'rejected': rejected})

        # Which of these employees may this user mark? (HODs: own department only.)
        emp_qs = Employee.objects.filter(id__in={e for e, _ in wanted})
        if user.role == 'HOD':
            emp_qs = emp_qs.filter(department=user.department)
        allowed = set(emp_qs.values_list('id', flat=True))

        todo = {}
        for (emp_id, day), loc in wanted.items():
            if emp_id in allowed:
                todo[(emp_id, day)] = loc
            else:
                rejected.append({'employee': emp_id, 'date': day.isoformat(),
                                 'reason': 'employee not found or not in your department'})
        if not todo:
            return Response({'saved': [], 'skipped': [], 'rejected': rejected})

        emp_ids = {e for e, _ in todo}
        days    = [d for _, d in todo]
        lo, hi  = min(days), max(days)

        def lookup():
            return {
                (r[1], r[2]): r for r in AttendanceRecord.objects.filter(
                    employee_id__in=emp_ids, date__gte=lo, date__lte=hi
                ).values_list('id', 'employee_id', 'date', 'status')
            }

        with transaction.atomic():
            already = lookup()
            fresh = [
                AttendanceRecord(employee_id=e, date=d, status=new_status,
                                 marked_by=user.username, work_location=loc)
                for (e, d), loc in todo.items() if (e, d) not in already
            ]
            # ignore_conflicts: if another admin marks the same day between our
            # lookup and the insert, the DB's unique (employee, date) constraint
            # skips that row instead of failing the whole batch.
            AttendanceRecord.objects.bulk_create(fresh, batch_size=500, ignore_conflicts=True)
            after = lookup()

        def row(key):
            rec_id, e, d, st = after[key]
            return {'id': rec_id, 'employee': e, 'date': d.isoformat(), 'status': st}

        saved   = [row(k) for k in todo if k in after and k not in already]
        skipped = [row(k) for k in todo if k in already]
        return Response({'saved': saved, 'skipped': skipped, 'rejected': rejected})
