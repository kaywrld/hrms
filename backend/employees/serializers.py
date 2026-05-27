import re
import imghdr
from rest_framework import serializers
from .models import (
    Department, Employee, AcademicQualification, EmployeeStatusLog,
    MAX_IMAGE_BYTES, MAX_DOC_BYTES, MAX_IMAGE_SIZE_MB, MAX_DOC_SIZE_MB,
)

ZW_ID_REGEX = re.compile(r'^\d{2}-\d{6,7}[A-Z]\d{2}$')

# Allowed MIME signatures for docs (magic bytes)
_PDF_MAGIC   = b'%PDF'
_DOCX_MAGIC  = b'PK\x03\x04'  # ZIP-based (docx)
_DOC_MAGIC   = b'\xd0\xcf\x11\xe0'  # OLE2 (doc)


def _validate_doc_file(file, field_name="file"):
    """Check size and magic bytes for CV / certificate uploads."""
    if file.size > MAX_DOC_BYTES:
        raise serializers.ValidationError(
            {field_name: f"File too large. Maximum size is {MAX_DOC_SIZE_MB} MB."}
        )
    header = file.read(8)
    file.seek(0)
    if not (header.startswith(_PDF_MAGIC) or
            header.startswith(_DOCX_MAGIC) or
            header.startswith(_DOC_MAGIC)):
        raise serializers.ValidationError(
            {field_name: "Invalid file type. Only PDF and Word documents are allowed."}
        )


def _validate_image_file(file, field_name="file"):
    """Check size and image magic bytes for profile pictures."""
    if file.size > MAX_IMAGE_BYTES:
        raise serializers.ValidationError(
            {field_name: f"Image too large. Maximum size is {MAX_IMAGE_SIZE_MB} MB."}
        )
    img_type = imghdr.what(file)
    file.seek(0)
    if img_type not in ('jpeg', 'png', 'webp'):
        raise serializers.ValidationError(
            {field_name: "Invalid image type. Only JPEG, PNG, and WebP are allowed."}
        )

class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Department
        fields = '__all__'


class AcademicQualificationSerializer(serializers.ModelSerializer):
    class Meta:
        model  = AcademicQualification
        fields = '__all__'
        read_only_fields = ('employee',)


class EmployeeStatusLogSerializer(serializers.ModelSerializer):
    class Meta:
        model  = EmployeeStatusLog
        fields = '__all__'
        read_only_fields = ('changed_at', 'changed_by')


class EmployeeSerializer(serializers.ModelSerializer):
    qualifications = AcademicQualificationSerializer(many=True, read_only=True)
    status_logs    = EmployeeStatusLogSerializer(many=True, read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)

    class Meta:
        model  = Employee
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')

    def validate_national_id(self, value):
        value = value.strip().upper()
        if not ZW_ID_REGEX.match(value):
            raise serializers.ValidationError(
                "National ID must be in format DD-NNNNNN(N)LNN, e.g. 63-207522S72 (6 digits) or 63-2075228S72 (7 digits)."
            )
        return value

    def validate_phone_number(self, value):
        # Strip all non-digit characters except leading +
        stripped = value.strip()
        if not stripped:
            raise serializers.ValidationError("Phone number is required.")
        return stripped

    def validate_profile_picture(self, value):
        if value:
            _validate_image_file(value, 'profile_picture')
        return value

    def validate_cv(self, value):
        if value:
            _validate_doc_file(value, 'cv')
        return value

    def validate_highest_education_certificate(self, value):
        if value:
            _validate_doc_file(value, 'highest_education_certificate')
        return value

    def validate(self, attrs):
        # Duplicate check: same first name + last name + DOB + national ID
        instance = self.instance  # None on create, Employee on update
        first = (attrs.get('first_name') or '').strip().lower()
        last  = (attrs.get('last_name')  or '').strip().lower()
        dob   = attrs.get('date_of_birth')
        nid   = (attrs.get('national_id') or '').strip().upper()

        qs = Employee.objects.filter(
            first_name__iexact=first,
            last_name__iexact=last,
            date_of_birth=dob,
            national_id__iexact=nid,
        )
        if instance:
            qs = qs.exclude(pk=instance.pk)

        if qs.exists():
            existing = qs.first()
            raise serializers.ValidationError(
                f"An employee with these details already exists: "
                f"{existing.first_name} {existing.last_name} ({existing.employee_number})."
            )
        return attrs


class EmployeeListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views"""
    department_name = serializers.CharField(source='department.name', read_only=True)

    class Meta:
        model  = Employee
        fields = (
            'id', 'employee_number', 'first_name', 'last_name', 'middle_name',
            'job_title', 'department', 'department_name',
            'gender', 'phone_number', 'email',
            'status', 'profile_picture', 'employment_type',
            'date_joined',
        )