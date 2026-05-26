import re
from rest_framework import serializers
from .models import Department, Employee, AcademicQualification, EmployeeStatusLog

ZW_ID_REGEX = re.compile(r'^\d{2}-\d{6,7}[A-Z]\d{2}$')

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