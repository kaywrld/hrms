from django.db import models
from django.core.validators import FileExtensionValidator

# Max upload sizes
MAX_IMAGE_SIZE_MB  = 5
MAX_DOC_SIZE_MB    = 10
MAX_IMAGE_BYTES    = MAX_IMAGE_SIZE_MB  * 1024 * 1024
MAX_DOC_BYTES      = MAX_DOC_SIZE_MB   * 1024 * 1024

ALLOWED_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp']
ALLOWED_DOC_EXTS   = ['pdf', 'doc', 'docx']

class Department(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)

    def __str__(self):
        return self.name


class Site(models.Model):
    """A physical work location / site (e.g. a mine site, branch, or client premises)."""
    name = models.CharField(max_length=120, unique=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Employee(models.Model):
    STATUS_CHOICES = [
        ('employed', 'Currently Employed'),
        ('retired', 'Retired'),
        ('dismissed', 'Dismissed'),
        ('resigned', 'Resigned'),
        ('suspended', 'Suspended'),
    ]

    # Personal Info
    first_name        = models.CharField(max_length=100)
    last_name         = models.CharField(max_length=100)
    middle_name       = models.CharField(max_length=100, blank=True)
    date_of_birth     = models.DateField()
    national_id       = models.CharField(max_length=50, unique=True)
    gender            = models.CharField(max_length=10, choices=[('M','Male'),('F','Female'),('O','Other')])
    phone_number      = models.CharField(max_length=20)
    email             = models.EmailField(blank=True)
    address           = models.TextField()
    profile_picture   = models.ImageField(
        upload_to='profile_pics/', blank=True, null=True,
        validators=[FileExtensionValidator(allowed_extensions=ALLOWED_IMAGE_EXTS)],
    )

    # Employment Info
    employee_number   = models.CharField(max_length=30, unique=True)
    department        = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, related_name='employees')
    site              = models.ForeignKey(Site, on_delete=models.SET_NULL, null=True, blank=True, related_name='employees')
    job_title         = models.CharField(max_length=100)
    date_joined       = models.DateField()
    employment_type   = models.CharField(max_length=20, choices=[
                            ('full_time','Full Time'),
                            ('part_time','Part Time'),
                            ('contract','Contract'),
                        ])
    status            = models.CharField(max_length=20, choices=STATUS_CHOICES, default='employed')
    status_reason     = models.TextField(blank=True, help_text='Required if retired, dismissed, or suspended')
    status_changed_at = models.DateTimeField(null=True, blank=True)

    # Next of Kin
    nok_full_name    = models.CharField(max_length=200, blank=True)
    nok_relationship = models.CharField(max_length=50, blank=True,
                           choices=[('spouse','Spouse'),('parent','Parent'),('sibling','Sibling'),
                                    ('child','Child'),('guardian','Guardian'),('friend','Friend'),('other','Other')])
    nok_phone        = models.CharField(max_length=20, blank=True)
    nok_email        = models.EmailField(blank=True)
    nok_national_id  = models.CharField(max_length=50, blank=True)
    nok_address      = models.TextField(blank=True)

    # Employment extras
    contract_start               = models.DateField(null=True, blank=True)
    contract_end                 = models.DateField(null=True, blank=True)
    highest_education            = models.CharField(max_length=20, blank=True,
                                       choices=[('o_level','O Level'),('a_level','A Level'),
                                                ('certificate','Certificate'),('diploma','Diploma'),
                                                ('degree','Degree'),('honours','Honours Degree'),
                                                ('masters','Masters'),('phd','PhD')])
    cv                           = models.FileField(
        upload_to='employee_cvs/', blank=True, null=True,
        validators=[FileExtensionValidator(allowed_extensions=ALLOWED_DOC_EXTS)],
    )
    highest_education_certificate = models.FileField(
        upload_to='education_certs/', blank=True, null=True,
        validators=[FileExtensionValidator(allowed_extensions=ALLOWED_DOC_EXTS)],
    )

    created_at        = models.DateTimeField(auto_now_add=True)
    updated_at        = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.employee_number} — {self.first_name} {self.last_name}"


class AcademicQualification(models.Model):
    LEVEL_CHOICES = [
        ('o_level', 'O Level'),
        ('a_level', 'A Level'),
        ('diploma', 'Diploma'),
        ('degree', 'Degree'),
        ('honours', 'Honours Degree'),
        ('masters', 'Masters'),
        ('phd', 'PhD'),
        ('certificate', 'Certificate'),
        ('other', 'Other'),
    ]

    employee      = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='qualifications')
    level         = models.CharField(max_length=20, choices=LEVEL_CHOICES)
    institution   = models.CharField(max_length=200)
    field_of_study = models.CharField(max_length=200)
    year_obtained = models.PositiveIntegerField()
    certificate   = models.FileField(
        upload_to='certificates/', blank=True, null=True,
        validators=[FileExtensionValidator(allowed_extensions=ALLOWED_DOC_EXTS)],
    )

    def __str__(self):
        return f"{self.employee} — {self.level} ({self.institution})"


class EmployeeStatusLog(models.Model):
    employee   = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='status_logs')
    old_status = models.CharField(max_length=20)
    new_status = models.CharField(max_length=20)
    reason     = models.TextField()
    changed_by = models.CharField(max_length=100)  # will link to AdminUser later
    changed_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.employee} | {self.old_status} → {self.new_status}"