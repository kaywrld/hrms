from rest_framework import serializers
from .models import Department, Employee, AcademicQualification, EmployeeStatusLog

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