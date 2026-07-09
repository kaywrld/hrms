"""
Bulk import helpers for uploading employees via Excel/CSV.

The uploaded sheet is expected to have a header row. Column headers are
matched loosely (case-insensitive, spaces/dashes/underscores are all
treated the same) against the aliases below, so users don't have to match
the model's exact field names — but using the downloadable template is
the safest option.

Only fields on the Employee model are supported here EXCLUDING file/image
fields (profile_picture, cv, highest_education_certificate) — those must
still be uploaded individually per-employee from the UI.
"""
import csv
import datetime
import io
import re

from django.utils.dateparse import parse_date

import openpyxl


# ── Header aliases: normalized header text -> model field name ──────────────
def _norm_key(text):
    """Lowercase, strip, collapse any run of non-alphanumeric chars to a single underscore."""
    key = re.sub(r'[^a-z0-9]+', '_', str(text).strip().lower())
    return key.strip('_')


_RAW_FIELD_ALIASES = {
    'first_name': ['first_name', 'firstname', 'first'],
    'last_name': ['last_name', 'lastname', 'surname', 'last'],
    'middle_name': ['middle_name', 'middlename'],
    'date_of_birth': ['date_of_birth', 'dob', 'birth_date', 'date_of_birth_dd_mm_yyyy'],
    'national_id': ['national_id', 'national_id_number', 'id_number', 'nationalid', 'nat_id'],
    'gender': ['gender', 'sex'],
    'phone_number': ['phone_number', 'phone', 'cell', 'mobile', 'cell_number', 'contact_number'],
    'email': ['email', 'email_address'],
    'address': ['address', 'home_address', 'residential_address'],
    'employee_number': ['employee_number', 'emp_number', 'employeenumber', 'emp_no', 'staff_number'],
    'department': ['department', 'dept'],
    'site': ['site', 'work_site', 'branch', 'location'],
    'job_title': ['job_title', 'jobtitle', 'position', 'title'],
    'date_joined': ['date_joined', 'joined_date', 'start_date', 'date_started', 'hire_date'],
    'employment_type': ['employment_type', 'employmenttype', 'type', 'employment'],
    'status': ['status', 'employment_status'],
    'status_reason': ['status_reason', 'reason'],
    'nok_full_name': ['nok_full_name', 'next_of_kin_name', 'next_of_kin', 'nok_name'],
    'nok_relationship': ['nok_relationship', 'next_of_kin_relationship', 'relationship'],
    'nok_phone': ['nok_phone', 'next_of_kin_phone', 'nok_phone_number'],
    'nok_email': ['nok_email', 'next_of_kin_email'],
    'nok_national_id': ['nok_national_id', 'next_of_kin_national_id', 'next_of_kin_id_number'],
    'nok_address': ['nok_address', 'next_of_kin_address'],
    'contract_start': ['contract_start', 'contract_start_date'],
    'contract_end': ['contract_end', 'contract_end_date'],
    'highest_education': ['highest_education', 'education', 'highest_education_level'],
    # ── Banking (Payroll model, not the Employee model) ────────────────────
    # A plain "Bank Name" / "Account Number" column on the sheet is assumed
    # to be the employee's USD account (see resolve_bank_name() below for the
    # fuzzy name matching against Zimbabwe's commercial banks, e.g. "NMB" ->
    # "NMB Bank"). These are popped out of row_data before it reaches
    # EmployeeSerializer and routed into a Payroll record instead.
    'bank_name': [
        'bank_name', 'bank', 'bank_name_usd', 'bankname', 'usd_bank',
        'usd_bank_name', 'bank_usd',
    ],
    'bank_account': [
        'bank_account', 'bank_account_number', 'account_number', 'acc_number',
        'account_no', 'bank_account_usd', 'accountnumber', 'usd_account_number',
        'usd_bank_account', 'usd_account', 'account',
    ],
    'basic_salary': ['basic_salary', 'salary', 'monthly_salary', 'basic_pay', 'monthly_pay'],
}

FIELD_ALIASES = {}
for _field, _aliases in _RAW_FIELD_ALIASES.items():
    for _alias in _aliases:
        FIELD_ALIASES[_alias] = _field


# ── Zimbabwean commercial banks — keep in sync with frontend/src/utils/banks.js ──
ZW_BANKS = [
    "CBZ Bank", "Stanbic Bank Zimbabwe", "Standard Chartered Bank Zimbabwe",
    "Steward Bank", "CABS (Central Africa Building Society)", "FBC Bank",
    "NMB Bank", "ZB Bank", "Nedbank Zimbabwe", "Ecobank Zimbabwe",
    "First Capital Bank", "BancABC (African Banking Corporation)",
    "POSB (People's Own Savings Bank)", "Agribank",
    "Metbank", "National Building Society (NBS)",
]

# Short-form / commonly-typed names that don't share a clean substring with
# the canonical name above (e.g. "SCB", "ABC Bank", "NBS").
BANK_ABBREVIATIONS = {
    'cbz': 'CBZ Bank',
    'stanbic': 'Stanbic Bank Zimbabwe',
    'standard_chartered': 'Standard Chartered Bank Zimbabwe',
    'scb': 'Standard Chartered Bank Zimbabwe',
    'steward': 'Steward Bank',
    'cabs': 'CABS (Central Africa Building Society)',
    'central_africa_building_society': 'CABS (Central Africa Building Society)',
    'fbc': 'FBC Bank',
    'nmb': 'NMB Bank',
    'zb': 'ZB Bank',
    'nedbank': 'Nedbank Zimbabwe',
    'ecobank': 'Ecobank Zimbabwe',
    'first_capital': 'First Capital Bank',
    'bancabc': 'BancABC (African Banking Corporation)',
    'abc_bank': 'BancABC (African Banking Corporation)',
    'african_banking_corporation': 'BancABC (African Banking Corporation)',
    'posb': "POSB (People's Own Savings Bank)",
    'peoples_own_savings_bank': "POSB (People's Own Savings Bank)",
    'agribank': 'Agribank',
    'agricultural_bank': 'Agribank',
    'metbank': 'Metbank',
    'nbs': 'National Building Society (NBS)',
    'national_building_society': 'National Building Society (NBS)',
}


def resolve_bank_name(value):
    """
    Match a bank name typed/pasted into a spreadsheet against Zimbabwe's
    commercial bank list, so partial or abbreviated entries (e.g. "NMB",
    "steward", "cbz bank harare branch") resolve to the same canonical name
    used by the Add/Edit Employee bank dropdowns ("NMB Bank", "Steward Bank",
    "CBZ Bank"...). Falls back to the title-cased original text if nothing
    matches, so an unrecognised bank name is still saved rather than dropped.
    """
    if value in (None, ''):
        return ''
    raw = str(value).strip()
    if not raw:
        return ''

    norm = _norm_key(raw)             # e.g. "nmb_bank"
    norm_spaced = norm.replace('_', ' ')  # e.g. "nmb bank"

    # 1. Exact match against a canonical name.
    for bank in ZW_BANKS:
        if _norm_key(bank) == norm:
            return bank

    # 2. Known abbreviation / short form.
    if norm in BANK_ABBREVIATIONS:
        return BANK_ABBREVIATIONS[norm]

    # 3. Substring match either direction — catches "NMB" -> "NMB Bank",
    #    "Steward" -> "Steward Bank", "CABS" -> "CABS (...)", etc.
    for bank in ZW_BANKS:
        bank_norm_spaced = _norm_key(bank).replace('_', ' ')
        if norm_spaced in bank_norm_spaced or bank_norm_spaced.startswith(norm_spaced):
            return bank

    # 4. Not recognised — keep what the user typed instead of losing it.
    return title_case(raw)

# ── Choice-value normalization maps (normalized text -> stored code) ────────
GENDER_MAP = {'m': 'M', 'male': 'M', 'f': 'F', 'female': 'F', 'o': 'O', 'other': 'O'}

EMPLOYMENT_TYPE_MAP = {
    'full_time': 'full_time', 'fulltime': 'full_time', 'ft': 'full_time',
    'part_time': 'part_time', 'parttime': 'part_time', 'pt': 'part_time',
    'contract': 'contract',
}

STATUS_MAP = {
    'employed': 'employed', 'currently_employed': 'employed', 'active': 'employed',
    'retired': 'retired',
    'dismissed': 'dismissed', 'terminated': 'dismissed', 'fired': 'dismissed',
    'resigned': 'resigned',
    'suspended': 'suspended',
}

NOK_RELATIONSHIP_MAP = {
    'spouse': 'spouse', 'parent': 'parent', 'sibling': 'sibling',
    'child': 'child', 'guardian': 'guardian', 'friend': 'friend', 'other': 'other',
}

HIGHEST_EDUCATION_MAP = {
    'o_level': 'o_level', 'olevel': 'o_level',
    'a_level': 'a_level', 'alevel': 'a_level',
    'certificate': 'certificate',
    'diploma': 'diploma',
    'degree': 'degree', 'bachelors': 'degree', 'bachelor_s': 'degree',
    'honours': 'honours', 'honours_degree': 'honours', 'honors': 'honours', 'honors_degree': 'honours',
    'masters': 'masters', 'master_s': 'masters', 'msc': 'masters', 'ma': 'masters',
    'phd': 'phd', 'doctorate': 'phd',
}

REQUIRED_FIELDS = [
    'first_name', 'last_name', 'date_of_birth', 'national_id',
    'gender', 'phone_number', 'address', 'job_title', 'employment_type',
]

# Friendly labels for reporting missing fields
FIELD_LABELS = {
    'first_name': 'First Name', 'last_name': 'Last Name', 'date_of_birth': 'Date of Birth',
    'national_id': 'National ID', 'gender': 'Gender', 'phone_number': 'Phone Number',
    'address': 'Address', 'job_title': 'Job Title', 'employment_type': 'Employment Type',
    'date_joined': 'Date Joined',
}


def _normalize_choice(value, mapping):
    if value in (None, ''):
        return None
    key = _norm_key(value)
    return mapping.get(key)


def parse_flexible_date(value):
    """Accept a date/datetime object (from Excel) or a string in several common formats."""
    if value in (None, ''):
        return None
    if isinstance(value, datetime.datetime):
        return value.date().isoformat()
    if isinstance(value, datetime.date):
        return value.isoformat()
    s = str(value).strip()
    if not s:
        return None
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%m/%d/%Y', '%d.%m.%Y', '%Y/%m/%d'):
        try:
            return datetime.datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    parsed = parse_date(s)
    if parsed:
        return parsed.isoformat()
    return None


IGNORED_SHEET_NAMES = {
    'sheet', 'sheet1', 'sheet2', 'sheet3', 'employees', 'employee',
    'data', 'import', 'template', 'instructions', 'master', 'roster',
}


def sheet_name_is_site_like(sheet_name):
    """
    Decide whether a workbook tab's name should be treated as a Site name.
    Generic tab names (Sheet1, Employees, Instructions...) are excluded so a
    plain single-sheet template doesn't accidentally create a junk Site.
    """
    if not sheet_name:
        return False
    return _norm_key(sheet_name) not in IGNORED_SHEET_NAMES


def read_workbook_sheets(file_obj, ext):
    """
    Return a list of (sheet_name, rows) tuples — one per worksheet for .xlsx/.xlsm,
    or a single (None, rows) tuple for .csv (CSVs have no concept of sheet tabs).
    Each `rows` entry is a list of rows, each a list of cell values; row 0 is
    expected to be the header row.
    """
    if ext in ('xlsx', 'xlsm'):
        buf = io.BytesIO(file_obj.read())
        wb = openpyxl.load_workbook(buf, data_only=True, read_only=True)
        return [(ws.title, [list(r) for r in ws.iter_rows(values_only=True)]) for ws in wb.worksheets]
    elif ext == 'csv':
        raw = file_obj.read()
        try:
            text = raw.decode('utf-8-sig')
        except UnicodeDecodeError:
            text = raw.decode('latin-1')
        reader = csv.reader(io.StringIO(text))
        return [(None, [row for row in reader])]
    else:
        raise ValueError(f"Unsupported file extension: .{ext}")


class _Placeholder:
    """Lightweight stand-in for a not-yet-persisted Site/Department during a
    preview (dry-run) pass, so repeated references to the same new name
    within one file resolve consistently without touching the database."""
    def __init__(self, id, name):
        self.id = id
        self.name = name


def resolve_site(site_val, sites_by_name, created_sites, commit=True):
    """
    Look up a Site by name (case-insensitive). Mutates `sites_by_name`
    (cache) and `created_sites` (names newly created/would-be-created).

    If `commit` is True and no matching Site exists, one is created in the
    database. If `commit` is False (preview/dry-run), no database write
    happens — the name is just tracked in `created_sites` and cached as a
    placeholder so later rows referencing the same new site name agree.

    Returns a (id, name) tuple. `id` is None for a not-yet-created site
    during a preview pass.
    """
    from .models import Site  # local import to avoid any import-order issues

    key = _norm_key(site_val)
    cached = sites_by_name.get(key)
    if cached:
        return cached.id, cached.name

    name = str(site_val).strip()
    site = Site.objects.filter(name__iexact=name).first()
    if site:
        sites_by_name[key] = site
        return site.id, site.name

    if commit:
        site = Site.objects.create(name=name)
        sites_by_name[key] = site
        created_sites.add(name)
        return site.id, site.name

    created_sites.add(name)
    sites_by_name[key] = _Placeholder(id=None, name=name)
    return None, name


def resolve_department(dept_val, departments_by_name, created_departments, commit=True):
    """
    Same behaviour as resolve_site(), but for Department. Unmatched
    department names are now auto-created (previously they were silently
    dropped, leaving the employee with no department assigned).
    """
    from .models import Department  # local import to avoid any import-order issues

    key = _norm_key(dept_val)
    cached = departments_by_name.get(key)
    if cached:
        return cached.id, cached.name

    name = str(dept_val).strip()
    dept = Department.objects.filter(name__iexact=name).first()
    if dept:
        departments_by_name[key] = dept
        return dept.id, dept.name

    if commit:
        dept = Department.objects.create(name=name)
        departments_by_name[key] = dept
        created_departments.add(name)
        return dept.id, dept.name

    created_departments.add(name)
    departments_by_name[key] = _Placeholder(id=None, name=name)
    return None, name


def map_headers(header_row):
    """Map column index -> model field name based on header text."""
    field_map = {}
    for idx, header in enumerate(header_row):
        if header in (None, ''):
            continue
        key = _norm_key(header)
        field = FIELD_ALIASES.get(key)
        if field:
            field_map[idx] = field
    return field_map


def title_case(s):
    """Turn 'STANSILUS NYAMASOKA' into 'Stansilus Nyamasoka'. Leaves falsy values as-is."""
    if not s:
        return s
    return ' '.join(w.capitalize() for w in str(s).split())


def split_full_name(full_name):
    """Split a single 'NAME' column into (first, last, middle)."""
    parts = [p for p in re.split(r'\s+', str(full_name).strip()) if p]
    if not parts:
        return '', '', ''
    if len(parts) == 1:
        return parts[0], '', ''
    if len(parts) == 2:
        return parts[0], parts[1], ''
    return parts[0], parts[-1], ' '.join(parts[1:-1])


LEGACY_HEADER_SCAN_ROWS = 8


def find_legacy_header_row(rows):
    """
    Scan the first several rows of a sheet for a row whose first cell is
    literally 'NAME' (a single combined full-name column) — the signature of
    the raw HR roster layout, as opposed to the flat template's separate
    'First Name' / 'Last Name' columns. Returns (row_index, header_list) or
    (None, None).
    """
    for r in range(min(LEGACY_HEADER_SCAN_ROWS, len(rows))):
        row = rows[r]
        if not row:
            continue
        first_cell = row[0]
        if first_cell and _norm_key(first_cell) == 'name':
            return r, row
    return None, None


def _legacy_col(headers, *needles):
    for i, h in enumerate(headers):
        if not h:
            continue
        hl = str(h).strip().lower()
        for needle in needles:
            if needle in hl:
                return i
    return None


def parse_legacy_roster_sheet(rows):
    """
    Parse a raw HR roster sheet: a few title/blank rows, then a header row
    whose first column is literally 'NAME', followed by employee rows —
    typically with a per-row SITE or DEPARTMENT column, a combined full name,
    and a repeated 'Name'/'Relationship' pair (once for the employee, once
    again further along for their next of kin).

    Returns a list of (excel_row_number, row_data) tuples using this module's
    internal field names — ready for process_row — or None if this sheet
    doesn't look like this layout at all (no 'NAME'-only header found).
    """
    header_idx, headers = find_legacy_header_row(rows)
    if header_idx is None:
        return None

    c_position   = _legacy_col(headers, 'position')
    c_site       = _legacy_col(headers, 'site')
    c_department = _legacy_col(headers, 'department', 'departrment')  # source has this typo on some tabs
    c_startdate  = _legacy_col(headers, 'start date')
    c_idpassport = _legacy_col(headers, 'id/passport', 'passport')
    c_dob        = _legacy_col(headers, 'date of birth')
    c_gender     = _legacy_col(headers, 'gender')
    c_homeadd    = _legacy_col(headers, 'home add')
    c_phone      = _legacy_col(headers, 'contact phone')
    c_emcontact  = _legacy_col(headers, 'emergency contact', 'next of kin')
    # Banking — saved onto Payroll as the employee's USD account (see
    # resolve_bank_name() for the fuzzy bank-name matching).
    c_bank       = _legacy_col(headers, 'bank name', 'bank')
    c_account    = _legacy_col(headers, 'account number', 'account no', 'acc number', 'acc no', 'account')
    c_salary     = _legacy_col(headers, 'salary', 'basic pay', 'basic salary')
    c_kinname = c_relationship = None
    for i, h in enumerate(headers):
        if not h:
            continue
        hl = str(h).strip().lower()
        if c_emcontact is not None and i > c_emcontact:
            if hl == 'name' and c_kinname is None:
                c_kinname = i
            if hl == 'relationship' and c_relationship is None:
                c_relationship = i

    def cell(row, idx):
        return row[idx] if idx is not None and idx < len(row) else None

    out = []
    for row_number, row in enumerate(rows[header_idx + 1:], start=header_idx + 2):
        if not row:
            continue
        name_val = row[0] if len(row) > 0 else None
        if not name_val or not str(name_val).strip():
            continue

        position = cell(row, c_position)
        site_val = cell(row, c_site)
        dept_val = cell(row, c_department)

        # Section-header rows (e.g. a bare "ADMINISTRATION") have a name but
        # nothing else filled in — these aren't real employees.
        if not position and not site_val and not dept_val:
            continue

        first, last, middle = split_full_name(name_val)
        kin_name = cell(row, c_kinname)

        out.append((row_number, {
            'first_name':  title_case(first),
            'last_name':   title_case(last),
            'middle_name': title_case(middle),
            'job_title':   title_case(position) if position else None,
            'site':        title_case(site_val) if site_val else None,
            'department':  title_case(dept_val) if dept_val else None,
            'date_joined':    cell(row, c_startdate),
            'national_id':    cell(row, c_idpassport),
            'date_of_birth':  cell(row, c_dob),
            'gender':         cell(row, c_gender),
            'address':        cell(row, c_homeadd),
            'phone_number':   cell(row, c_phone),
            'nok_phone':      cell(row, c_emcontact),
            'nok_full_name':  title_case(kin_name) if kin_name else None,
            'nok_relationship': cell(row, c_relationship),
            'bank_name':      cell(row, c_bank),
            'bank_account':   cell(row, c_account),
            'basic_salary':   cell(row, c_salary),
            # The source sheet has no Employment Type column at all — default
            # to Full Time; edit individual records afterwards if some
            # employees are actually part-time or contract.
            'employment_type': 'Full Time',
        }))
    return out


def generate_employee_number(seen_numbers):
    year = str(datetime.date.today().year)[2:]
    num = 1
    while True:
        candidate = f"EMP{year}{str(num).zfill(4)}"
        if candidate not in seen_numbers:
            return candidate
        num += 1


def process_row(row_data, departments_by_name, sites_by_name, seen_numbers, seen_national_ids,
                 created_sites, created_departments, commit=True):
    """
    Mutates row_data in place, converting/normalizing values so it can be
    passed straight to EmployeeSerializer(data=row_data).

    Returns an error message string if the row should be skipped, or None
    if the row is ready for serializer validation.
    """
    # Trim whitespace on all string values. Keep '' as '' (don't convert to
    # None) — most optional text fields on the model are blank=True but
    # null=False, so Django expects an empty string there, not NULL.
    for k, v in list(row_data.items()):
        if isinstance(v, str):
            row_data[k] = v.strip()

    # ── Banking + salary (Payroll model, not Employee) ──────────────────────
    # Pulled out before the Employee validation below since these three
    # columns don't live on the Employee model at all — process_row hands
    # them back to the caller (via the leading underscore keys) so it can
    # create/update a Payroll record once the Employee row itself succeeds.
    # Per default, any bank/account column on the sheet is treated as the
    # employee's USD account.
    raw_bank_name    = row_data.pop('bank_name', None)
    raw_bank_account = row_data.pop('bank_account', None)
    raw_basic_salary = row_data.pop('basic_salary', None)

    row_data['_bank_name_usd'] = resolve_bank_name(raw_bank_name) if raw_bank_name else ''
    row_data['_bank_account_usd'] = str(raw_bank_account).strip() if raw_bank_account not in (None, '') else ''

    row_data['_basic_salary'] = None
    if raw_basic_salary not in (None, ''):
        try:
            row_data['_basic_salary'] = float(str(raw_basic_salary).replace(',', '').strip())
        except (TypeError, ValueError):
            return f"Could not read Basic Salary value: '{raw_basic_salary}'"

    # ── Required fields present? ────────────────────────────────────────────
    missing = [f for f in REQUIRED_FIELDS if not row_data.get(f)]
    if missing:
        labels = [FIELD_LABELS.get(f, f) for f in missing]
        return f"Missing required field(s): {', '.join(labels)}"

    # ── Dates ────────────────────────────────────────────────────────────────
    dob = parse_flexible_date(row_data.get('date_of_birth'))
    if not dob:
        return f"Could not read Date of Birth value: '{row_data.get('date_of_birth')}'"
    row_data['date_of_birth'] = dob

    contract_start = None
    if row_data.get('contract_start'):
        contract_start = parse_flexible_date(row_data['contract_start'])
        if not contract_start:
            return f"Could not read Contract Start date: '{row_data.get('contract_start')}'"
    row_data['contract_start'] = contract_start

    contract_end = None
    if row_data.get('contract_end'):
        contract_end = parse_flexible_date(row_data['contract_end'])
        if not contract_end:
            return f"Could not read Contract End date: '{row_data.get('contract_end')}'"
    row_data['contract_end'] = contract_end

    date_joined = None
    if row_data.get('date_joined'):
        date_joined = parse_flexible_date(row_data['date_joined'])
        if not date_joined:
            return f"Could not read Date Joined value: '{row_data.get('date_joined')}'"

    # ── Employment type ──────────────────────────────────────────────────────
    employment_type = _normalize_choice(row_data.get('employment_type'), EMPLOYMENT_TYPE_MAP)
    if not employment_type:
        return f"Unrecognised Employment Type: '{row_data.get('employment_type')}' (use Full Time, Part Time, or Contract)"
    row_data['employment_type'] = employment_type

    if employment_type == 'contract':
        if not contract_start or not contract_end:
            return "Contract employees require both Contract Start and Contract End dates"
        if not date_joined:
            date_joined = contract_start
    else:
        if not date_joined:
            return "Missing required field(s): Date Joined"
    row_data['date_joined'] = date_joined

    # ── Gender ───────────────────────────────────────────────────────────────
    gender = _normalize_choice(row_data.get('gender'), GENDER_MAP)
    if not gender:
        return f"Unrecognised Gender: '{row_data.get('gender')}' (use Male, Female, or Other)"
    row_data['gender'] = gender

    # ── Status ───────────────────────────────────────────────────────────────
    if row_data.get('status'):
        status = _normalize_choice(row_data['status'], STATUS_MAP)
        if not status:
            return f"Unrecognised Status: '{row_data.get('status')}'"
        row_data['status'] = status
    else:
        row_data['status'] = 'employed'

    # ── Highest education (optional — never blocks the row) ────────────────
    if row_data.get('highest_education'):
        he = _normalize_choice(row_data['highest_education'], HIGHEST_EDUCATION_MAP)
        row_data['highest_education'] = he or ''  # unrecognised value: just drop it, don't fail the row

    # ── Next of kin relationship (optional — never blocks the row) ─────────
    if row_data.get('nok_relationship'):
        nr = _normalize_choice(row_data['nok_relationship'], NOK_RELATIONSHIP_MAP)
        row_data['nok_relationship'] = nr or 'other'  # unrecognised value (e.g. "Auntie"): file under Other

    # ── Department (optional, auto-created if it doesn't already exist) ────
    dept_val = row_data.get('department')
    if dept_val:
        dept_id, dept_name = resolve_department(dept_val, departments_by_name, created_departments, commit)
        row_data['_department_name'] = dept_name
        if commit:
            row_data['department'] = dept_id
        else:
            row_data.pop('department', None)
    else:
        row_data.pop('department', None)
        row_data['_department_name'] = None

    # ── Site (optional, auto-created if it doesn't already exist) ──────────
    site_val = row_data.get('site')
    if site_val:
        site_id, site_name = resolve_site(site_val, sites_by_name, created_sites, commit)
        row_data['_site_name'] = site_name
        if commit:
            row_data['site'] = site_id
        else:
            row_data.pop('site', None)
    else:
        row_data.pop('site', None)
        row_data['_site_name'] = None

    # ── National ID: in-file / in-database duplicate pre-check ─────────────
    nid = str(row_data['national_id']).strip().upper()
    if nid in seen_national_ids:
        return f"Duplicate National ID '{nid}' (already used earlier in this file or by an existing employee)"

    # ── Employee number: auto-generate if missing, else check duplicates ───
    emp_no = row_data.get('employee_number')
    if not emp_no:
        emp_no = generate_employee_number(seen_numbers)
    else:
        emp_no = str(emp_no).strip()
        if emp_no in seen_numbers:
            return f"Duplicate Employee Number '{emp_no}' (already used earlier in this file or by an existing employee)"
    row_data['employee_number'] = emp_no

    if row_data.get('email') is None:
        row_data['email'] = ''

    return None