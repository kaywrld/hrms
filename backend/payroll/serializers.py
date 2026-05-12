from rest_framework import serializers
from .models import Payroll

class PayrollSerializer(serializers.ModelSerializer):
    net_salary    = serializers.ReadOnlyField()
    employee_name = serializers.SerializerMethodField()

    class Meta:
        model  = Payroll
        fields = '__all__'
        read_only_fields = ('updated_at', 'updated_by')

    def get_employee_name(self, obj):
        return f"{obj.employee.first_name} {obj.employee.last_name}"