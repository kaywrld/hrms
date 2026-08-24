from rest_framework import serializers
from .models import Shift, AttendanceRecord, WorkLocation


class ShiftSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Shift
        fields = '__all__'


class AttendanceRecordSerializer(serializers.ModelSerializer):
    employee_name        = serializers.SerializerMethodField()
    employee_job_title   = serializers.SerializerMethodField()
    shift_name           = serializers.CharField(source='shift.get_name_display', read_only=True)
    marked_by_department = serializers.SerializerMethodField()
    marked_by_full_name  = serializers.SerializerMethodField()

    class Meta:
        model  = AttendanceRecord
        fields = '__all__'
        read_only_fields = ('marked_by', 'created_at')

    def get_unique_together_validators(self):
        # Disable DRF's auto UniqueTogetherValidator for (employee, date) —
        # we handle the upsert ourselves in create() below instead of
        # rejecting the request with a 400.
        return []

    def create(self, validated_data):
        employee = validated_data.pop('employee')
        date = validated_data.pop('date')
        # update_or_create is atomic at the DB level (single UPDATE or
        # INSERT), so this is safe even if two requests race for the same
        # employee/date — no window for a duplicate-key error to surface.
        obj, _ = AttendanceRecord.objects.update_or_create(
            employee=employee,
            date=date,
            defaults=validated_data,
        )
        return obj

    def get_employee_name(self, obj):
        return f"{obj.employee.first_name} {obj.employee.last_name}"

    def get_employee_job_title(self, obj):
        return obj.employee.job_title or None

    def _get_admin(self, obj):
        if not obj.marked_by:
            return None
        if not hasattr(obj, '_admin_user_cache'):
            from accounts.models import AdminUser
            obj._admin_user_cache = AdminUser.objects.filter(
                username=obj.marked_by
            ).select_related('department').first()
        return obj._admin_user_cache

    def get_marked_by_department(self, obj):
        admin = self._get_admin(obj)
        if admin and admin.department:
            return admin.department.name
        return None

    def get_marked_by_full_name(self, obj):
        admin = self._get_admin(obj)
        if admin and admin.full_name:
            return admin.full_name
        return obj.marked_by


class WorkLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model  = WorkLocation
        fields = ('id', 'name', 'created_by', 'created_at')
        read_only_fields = ('created_by', 'created_at')