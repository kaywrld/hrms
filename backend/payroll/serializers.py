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

    def validate(self, data):
        pay_type = data.get('pay_type', getattr(self.instance, 'pay_type', 'monthly'))
        basic_salary = data.get('basic_salary', getattr(self.instance, 'basic_salary', None))
        daily_rate   = data.get('daily_rate',   getattr(self.instance, 'daily_rate', None))
        if pay_type == 'monthly' and not basic_salary:
            raise serializers.ValidationError({'basic_salary': 'Required for monthly-salary employees.'})
        if pay_type == 'daily' and not daily_rate:
            raise serializers.ValidationError({'daily_rate': 'Required for daily-rate employees.'})
        return data