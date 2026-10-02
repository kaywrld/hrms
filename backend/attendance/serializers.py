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
        """
        Look up the AdminUser who marked this record.

        Previously this ran one AdminUser query PER RECORD (the cache lived on
        the record object, so it never saved anything). A month register is
        thousands of records, so that was thousands of queries per request.
        Now every admin is loaded in ONE query the first time it's needed and
        shared by every record in the response via the serializer context.
        """
        if not obj.marked_by:
            return None
        admins = self.context.get('_admin_by_username')
        if admins is None:
            from accounts.models import AdminUser
            admins = {a.username: a for a in AdminUser.objects.select_related('department')}
            # `context` is shared with the child serializer of a many=True
            # list, so this one dict serves the whole response.
            self.context['_admin_by_username'] = admins
        return admins.get(obj.marked_by)

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