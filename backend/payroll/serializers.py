from decimal import Decimal, ROUND_HALF_UP
from rest_framework import serializers
from .models import Payroll, PayrollAdjustment, LongTermDeduction

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

class PayrollAdjustmentSerializer(serializers.ModelSerializer):
    class Meta:
        model  = PayrollAdjustment
        fields = '__all__'
        read_only_fields = ('updated_at', 'updated_by')


class LongTermDeductionSerializer(serializers.ModelSerializer):
    employee_name           = serializers.SerializerMethodField()
    total_paid               = serializers.ReadOnlyField()
    balance                   = serializers.ReadOnlyField()
    elapsed_months            = serializers.ReadOnlyField()
    end_year                  = serializers.SerializerMethodField()
    end_month                 = serializers.SerializerMethodField()
    # Only populated when the request carries ?year=&month= — the amount this
    # specific plan contributes to that employee's deduction for that month.
    installment_this_month    = serializers.SerializerMethodField()

    class Meta:
        model  = LongTermDeduction
        fields = [
            'id', 'employee', 'employee_name', 'reason', 'notes',
            'total_amount', 'number_of_months', 'monthly_amount',
            'start_year', 'start_month', 'end_year', 'end_month',
            'status', 'cancelled_at',
            'total_paid', 'balance', 'elapsed_months', 'installment_this_month',
            'created_by', 'created_at', 'updated_at', 'updated_by',
        ]
        read_only_fields = ('monthly_amount', 'cancelled_at', 'created_by', 'created_at', 'updated_at', 'updated_by')

    def get_employee_name(self, obj):
        return f"{obj.employee.first_name} {obj.employee.last_name}"

    def get_end_year(self, obj):
        return obj.end_year_month[0]

    def get_end_month(self, obj):
        return obj.end_year_month[1]

    def get_installment_this_month(self, obj):
        request = self.context.get('request')
        if request is None:
            return None
        year  = request.query_params.get('year')
        month = request.query_params.get('month')
        if not (year and month):
            return None
        try:
            return str(obj.installment_for(int(year), int(month)))
        except (TypeError, ValueError):
            return None

    def validate_status(self, value):
        # 'completed' is set automatically once every installment has elapsed —
        # from the API the only manual transition allowed is cancelling (or
        # re-activating a plan that hasn't been cancelled for good reason).
        if value not in ('active', 'cancelled'):
            raise serializers.ValidationError("Status can only be manually set to 'active' or 'cancelled'.")
        return value

    def validate(self, data):
        total_amount     = data.get('total_amount',     getattr(self.instance, 'total_amount', None))
        number_of_months = data.get('number_of_months', getattr(self.instance, 'number_of_months', None))
        if total_amount is None or total_amount <= 0:
            raise serializers.ValidationError({'total_amount': 'Must be greater than 0.'})
        if not number_of_months or number_of_months < 1:
            raise serializers.ValidationError({'number_of_months': 'Must be at least 1 month.'})
        start_month = data.get('start_month', getattr(self.instance, 'start_month', None))
        if start_month is not None and not (1 <= start_month <= 12):
            raise serializers.ValidationError({'start_month': 'Must be between 1 and 12.'})
        return data

    @staticmethod
    def _monthly_amount(total_amount, number_of_months):
        return (Decimal(total_amount) / int(number_of_months)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    def create(self, validated_data):
        validated_data['monthly_amount'] = self._monthly_amount(
            validated_data['total_amount'], validated_data['number_of_months']
        )
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if 'total_amount' in validated_data or 'number_of_months' in validated_data:
            total_amount     = validated_data.get('total_amount',     instance.total_amount)
            number_of_months = validated_data.get('number_of_months', instance.number_of_months)
            validated_data['monthly_amount'] = self._monthly_amount(total_amount, number_of_months)
        return super().update(instance, validated_data)