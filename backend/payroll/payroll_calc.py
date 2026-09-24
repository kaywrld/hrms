"""
Shared payroll calculation logic.

This is a straight, deliberate port of the calculation that used to live
(duplicated three times, with no shared module) in the frontend:
  - components/HRPortal/PayrollPage.jsx
  - components/HRPortal/PayslipsPage.jsx
  - components/MDPortal/PayrollPage.jsx

Moving it here lets the backend return already-computed, paginated,
search/filterable payroll rows instead of every employee/attendance/
adjustment/loan record being shipped to the browser so it can do this
same computation client-side on every page load.

IMPORTANT: every function below was written to match the original JS
function-for-function (same variable names where practical) so it can be
diffed against the frontend source. If you change the business rule here,
change it in the (now-deleted) frontend copies too, or better — make sure
the frontend is calling this endpoint instead of computing its own copy.

Before deleting the old frontend calculation code, compare this endpoint's
numbers against the old page's numbers for a real month with real data.
"""
from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal

# ── Zimbabwe public holidays ──────────────────────────────────────────────
# Recurring fixed-date holidays as "MM-DD". Matches ZW_PUBLIC_HOLIDAYS_RECURRING
# / ZW_RECURRING in the frontend exactly.
ZW_PUBLIC_HOLIDAYS_RECURRING = [
    "01-01", "02-21", "04-18", "05-01", "05-25",
    "08-11", "08-12", "09-15", "12-22", "12-25", "12-26",
]


def _easter_sunday(year):
    """Meeus/Jones/Butcher Gregorian Easter algorithm — same arithmetic as
    the frontend's getZwPublicHolidays(). Returns a date object."""
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31       # 1-indexed month
    day = (h + l - 7 * m + 114) % 31 + 1
    return date(year, month, day)


def get_zw_public_holidays(year, month0):
    """month0 is 0-indexed (Jan=0), matching the JS convention this was
    ported from. Returns a set of 'YYYY-MM-DD' strings for holidays that
    fall on a weekday within that month."""
    holidays = set()
    for mmdd in ZW_PUBLIC_HOLIDAYS_RECURRING:
        m_str, d_str = mmdd.split("-")
        m, d = int(m_str), int(d_str)
        if m - 1 == month0:
            dt = date(year, m, d)
            if dt.weekday() < 5:  # Mon-Fri only (weekday(): Mon=0 .. Sun=6)
                holidays.add(dt.isoformat())

    easter_sunday = _easter_sunday(year)
    good_friday = easter_sunday - timedelta(days=2)
    easter_monday = easter_sunday + timedelta(days=1)
    for dt in (good_friday, easter_monday):
        if (dt.month - 1) == month0:
            holidays.add(dt.isoformat())

    return holidays


def is_working_day(date_str):
    dt = date.fromisoformat(date_str)
    if dt.weekday() >= 5:
        return False
    holidays = get_zw_public_holidays(dt.year, dt.month - 1)
    return date_str not in holidays


def get_working_days_in_month(year, month0):
    days_in_month = monthrange(year, month0 + 1)[1]
    holidays = get_zw_public_holidays(year, month0)
    count = 0
    for d in range(1, days_in_month + 1):
        dt = date(year, month0 + 1, d)
        if dt.weekday() >= 5:
            continue
        if dt.isoformat() in holidays:
            continue
        count += 1
    return count


# ── Per-employee attendance tallying ──────────────────────────────────────
# Matches attendanceMap / attendanceAllDaysMap / extraDayCreditMap in the
# frontend. `records` is an iterable of (date_str, status) tuples for ONE
# employee, already filtered to the viewed month.
_COUNTABLE_STATUSES = ("present", "late", "half_day")


def tally_attendance(records):
    """Returns (normal_days, all_days, extra_day_credit) for one employee's
    attendance records in the viewed month.
      - normal_days: countable days that fall on a normal working day
      - all_days: all countable days regardless of day-of-week (used for
        daily-rate employees, who are paid for every day worked)
      - extra_day_credit: countable days that fall on a weekend/holiday
        (used to offset missed normal working days for monthly-salary staff)
    """
    normal_days = 0.0
    all_days = 0.0
    extra_day_credit = 0.0
    for date_str, status in records:
        if status not in _COUNTABLE_STATUSES:
            continue
        weight = 0.5 if status == "half_day" else 1.0
        all_days += weight
        if is_working_day(date_str):
            normal_days += weight
        else:
            extra_day_credit += weight
    return normal_days, all_days, extra_day_credit


def compute_payroll_row(
    *,
    payroll,               # Payroll instance or None
    working_days,          # int, from get_working_days_in_month()
    normal_days_attended,  # float
    extra_day_credit,      # float
    all_days_attended,     # float
    manual_deduction=Decimal("0"),
    loan_deduction=Decimal("0"),
    bonus=Decimal("0"),
):
    """Mirrors the `enriched` row computation in the frontend exactly.
    Returns a dict of the computed fields (all plain floats, in USD —
    ZiG conversion stays a frontend display concern, same as before)."""
    is_daily = bool(payroll and payroll.pay_type == "daily")
    monthly_salary = 0.0 if is_daily else float(payroll.basic_salary or 0) if payroll else 0.0

    if is_daily:
        daily_rate = float(payroll.daily_rate or 0) if payroll else 0.0
    else:
        daily_rate = (monthly_salary / working_days) if working_days > 0 else 0.0

    missing_days = max(0.0, working_days - normal_days_attended)
    credit_applied = min(extra_day_credit, missing_days)
    monthly_days_attended = normal_days_attended + credit_applied
    days_attended = all_days_attended if is_daily else monthly_days_attended

    net_salary = daily_rate * days_attended
    manual_deduction = float(manual_deduction or 0)
    loan_deduction = float(loan_deduction or 0)
    bonus = float(bonus or 0)
    deduction = manual_deduction + loan_deduction
    final_pay = max(0.0, net_salary - deduction + bonus)

    return {
        "is_daily": is_daily,
        "pay_type": "daily" if is_daily else "monthly",
        "monthly_salary": monthly_salary,
        "daily_rate": daily_rate,
        "days_attended": days_attended,
        "credit_applied": 0.0 if is_daily else credit_applied,
        "net_salary": net_salary,
        "manual_deduction": manual_deduction,
        "loan_deduction": loan_deduction,
        "deduction": deduction,
        "bonus": bonus,
        "final_pay": final_pay,
    }