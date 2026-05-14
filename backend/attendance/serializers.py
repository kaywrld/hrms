from rest_framework import serializers
from .models import Shift, AttendanceRecord, WorkLocation

class ShiftSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Shift
        fields = '__all__'


class AttendanceRecordSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    shift_name    = serializers.CharField(source='shift.get_name_display', read_only=True)

    class Meta:
        model  = AttendanceRecord
        fields = '__all__'
        read_only_fields = ('marked_by', 'created_at')

    def get_employee_name(self, obj):
        return f"{obj.employee.first_name} {obj.employee.last_name}"

class WorkLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model  = WorkLocation
        fields = ('id', 'name', 'created_by', 'created_at')
        read_only_fields = ('created_by', 'created_at')