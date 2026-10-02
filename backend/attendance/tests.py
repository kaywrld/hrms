from datetime import date

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from accounts.models import AdminUser
from employees.models import Department, Employee
from .models import AttendanceRecord


def rows(response):
    # The list endpoint returns a plain list when pagination isn't configured
    # and {'results': [...]} when it is — accept both.
    data = response.data
    return data['results'] if isinstance(data, dict) else data


def make_employee(n, dept):
    return Employee.objects.create(
        first_name=f'First{n}', last_name=f'Last{n}', date_of_birth=date(1990, 1, 1),
        national_id=f'ID{n}', gender='M', phone_number='0770000000', address='x',
        employee_number=f'E{n}', department=dept, job_title='Tester',
        date_joined=date(2020, 1, 1), employment_type='full_time',
    )


class RegisterEndpointsTests(TestCase):
    def setUp(self):
        self.dept_a = Department.objects.create(name='A')
        self.dept_b = Department.objects.create(name='B')
        self.emps_a = [make_employee(i, self.dept_a) for i in range(1, 6)]
        self.emp_b = make_employee(99, self.dept_b)

        self.hrm = AdminUser.objects.create_user(
            'hrm', password='x', full_name='Hr Manager', email='hrm@x.com', role='HRM')
        self.hod = AdminUser.objects.create_user(
            'hod', password='x', full_name='Head A', email='hod@x.com', role='HOD', department=self.dept_a)
        self.hr = AdminUser.objects.create_user(
            'hr', password='x', full_name='Std HR', email='hr@x.com', role='HR')

    def client_for(self, user):
        c = APIClient()
        c.force_authenticate(user=user)
        return c

    def bulk(self, user, records, **extra):
        return self.client_for(user).post(
            '/attendance/register/bulk/', {'records': records, **extra}, format='json')

    # ── bulk mark ────────────────────────────────────────────────────────────
    def test_bulk_creates_records(self):
        recs = [{'employee': e.id, 'date': '2026-10-01', 'work_location': 'Masons'} for e in self.emps_a]
        r = self.bulk(self.hrm, recs)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data['saved']), 5)
        self.assertEqual(r.data['skipped'], [])
        self.assertEqual(AttendanceRecord.objects.count(), 5)
        rec = AttendanceRecord.objects.first()
        self.assertEqual((rec.status, rec.marked_by, rec.work_location), ('present', 'hrm', 'Masons'))
        self.assertTrue(all(s['id'] for s in r.data['saved']))

    def test_bulk_never_overwrites_existing_status(self):
        e = self.emps_a[0]
        AttendanceRecord.objects.create(employee=e, date=date(2026, 10, 1), status='leave', marked_by='hod')
        r = self.bulk(self.hrm, [{'employee': e.id, 'date': '2026-10-01'},
                                 {'employee': e.id, 'date': '2026-10-02'}])
        self.assertEqual([s['date'] for s in r.data['saved']], ['2026-10-02'])
        self.assertEqual([(s['date'], s['status']) for s in r.data['skipped']], [('2026-10-01', 'leave')])
        self.assertEqual(AttendanceRecord.objects.get(employee=e, date=date(2026, 10, 1)).status, 'leave')

    def test_bulk_is_idempotent(self):
        recs = [{'employee': self.emps_a[0].id, 'date': '2026-10-05'}]
        self.bulk(self.hrm, recs)
        r = self.bulk(self.hrm, recs)
        self.assertEqual(r.data['saved'], [])
        self.assertEqual(len(r.data['skipped']), 1)
        self.assertEqual(AttendanceRecord.objects.count(), 1)

    def test_bulk_dedupes_within_request(self):
        e = self.emps_a[0]
        r = self.bulk(self.hrm, [{'employee': e.id, 'date': '2026-10-05'}] * 3)
        self.assertEqual(len(r.data['saved']), 1)

    def test_hod_limited_to_own_department(self):
        r = self.bulk(self.hod, [{'employee': self.emps_a[0].id, 'date': '2026-10-01'},
                                 {'employee': self.emp_b.id, 'date': '2026-10-01'}])
        self.assertEqual(len(r.data['saved']), 1)
        self.assertEqual(len(r.data['rejected']), 1)
        self.assertFalse(AttendanceRecord.objects.filter(employee=self.emp_b).exists())

    def test_standard_hr_cannot_mark(self):
        r = self.bulk(self.hr, [{'employee': self.emps_a[0].id, 'date': '2026-10-01'}])
        self.assertEqual(r.status_code, 403)
        self.assertEqual(AttendanceRecord.objects.count(), 0)

    def test_bad_input(self):
        self.assertEqual(self.bulk(self.hrm, []).status_code, 400)
        self.assertEqual(self.bulk(self.hrm, [{'employee': 1, 'date': '2026-10-01'}], status='nope').status_code, 400)
        r = self.bulk(self.hrm, [{'employee': 'abc', 'date': '2026-10-01'},
                                 {'employee': self.emps_a[0].id, 'date': 'not-a-date'},
                                 {'employee': 987654, 'date': '2026-10-01'}])
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data['rejected']), 3)
        self.assertEqual(AttendanceRecord.objects.count(), 0)

    def test_bulk_uses_a_fixed_number_of_queries(self):
        emps = [make_employee(1000 + i, self.dept_a) for i in range(60)]
        recs = [{'employee': e.id, 'date': f'2026-10-{d:02d}'} for e in emps for d in range(1, 21)]  # 1200 cells
        with CaptureQueriesContext(connection) as ctx:
            r = self.bulk(self.hrm, recs)
        self.assertEqual(len(r.data['saved']), 1200)
        # Was 1200 separate requests x several queries each. Now a few SELECTs plus
        # batched INSERTs (SQLite's 999-variable limit makes it split the batches
        # more finely than MySQL will), nowhere near one query per cell.
        self.assertLess(len(ctx), 40, [q['sql'][:80] for q in ctx])

    # ── month fetch ──────────────────────────────────────────────────────────
    def test_month_endpoint_shape_and_site_defaults(self):
        e = self.emps_a[0]
        for d, loc in [(1, 'Masons'), (2, 'Masons'), (3, 'Harare'), (4, '')]:
            AttendanceRecord.objects.create(employee=e, date=date(2026, 10, d), status='present',
                                            marked_by='hrm', work_location=loc)
        AttendanceRecord.objects.create(employee=e, date=date(2026, 9, 30), status='present', marked_by='hrm')
        r = self.client_for(self.hrm).get('/attendance/register/?year=2026&month=10')
        self.assertEqual(r.status_code, 200)
        days = r.data['records'][e.id]
        self.assertEqual(sorted(days), ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
        self.assertEqual(days['2026-10-01']['status'], 'present')
        self.assertIn('id', days['2026-10-01'])
        self.assertEqual(r.data['site_defaults'], {e.id: 'Masons'})

    def test_month_endpoint_hod_scope_and_validation(self):
        AttendanceRecord.objects.create(employee=self.emps_a[0], date=date(2026, 10, 1), status='present', marked_by='x')
        AttendanceRecord.objects.create(employee=self.emp_b, date=date(2026, 10, 1), status='present', marked_by='x')
        r = self.client_for(self.hod).get('/attendance/register/?year=2026&month=10')
        self.assertEqual(list(r.data['records']), [self.emps_a[0].id])
        for qs in ('', '?year=2026', '?year=2026&month=13', '?year=abc&month=1'):
            self.assertEqual(self.client_for(self.hrm).get('/attendance/register/' + qs).status_code, 400)

    def test_month_endpoint_uses_a_fixed_number_of_queries(self):
        for i, e in enumerate(self.emps_a):
            for d in range(1, 21):
                AttendanceRecord.objects.create(employee=e, date=date(2026, 10, d), status='present', marked_by='hrm')
        with CaptureQueriesContext(connection) as ctx:
            self.client_for(self.hrm).get('/attendance/register/?year=2026&month=10')
        self.assertLess(len(ctx), 6)

    # ── existing list endpoint: N+1 fix ──────────────────────────────────────
    def test_list_endpoint_query_count_does_not_scale_with_records(self):
        def count_for(n_days):
            AttendanceRecord.objects.all().delete()
            for e in self.emps_a:
                for d in range(1, n_days + 1):
                    AttendanceRecord.objects.create(employee=e, date=date(2026, 10, d), status='present', marked_by='hrm')
            with CaptureQueriesContext(connection) as ctx:
                r = self.client_for(self.hrm).get('/attendance/?date_after=2026-10-01&date_before=2026-10-31&page_size=8000')
            self.assertEqual(len(rows(r)), 5 * n_days)
            return len(ctx)
        small, large = count_for(2), count_for(20)
        self.assertEqual(small, large)

    def test_list_endpoint_still_reports_marker_name_and_department(self):
        AttendanceRecord.objects.create(employee=self.emps_a[0], date=date(2026, 10, 1), status='present', marked_by='hod')
        r = self.client_for(self.hrm).get('/attendance/?date=2026-10-01')
        row = rows(r)[0]
        self.assertEqual(row['marked_by_full_name'], 'Head A')
        self.assertEqual(row['marked_by_department'], 'A')
