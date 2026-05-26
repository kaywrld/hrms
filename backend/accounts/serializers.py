from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import AdminUser, LoginActivity


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['full_name'] = user.full_name
        token['role']      = user.role
        token['email']     = user.email
        if user.department:
            token['department_id']   = user.department.id
            token['department_name'] = user.department.name
        token['session_jti'] = str(token['jti'])
        return token

    def validate(self, attrs):
        # Validate credentials — wrong password/username raised here
        data = super().validate(attrs)

        dept = self.user.department
        data['user'] = {
            'id':                   self.user.id,
            'username':             self.user.username,
            'full_name':            self.user.full_name,
            'email':                self.user.email,
            'role':                 self.user.role,
            'department':           dept.name if dept is not None else None,
            'must_change_password': self.user.must_change_password,
        }
        return data


class LoginActivitySerializer(serializers.ModelSerializer):
    class Meta:
        model  = LoginActivity
        fields = ('id', 'event', 'timestamp', 'ip_address', 'user_agent')


class AdminUserSerializer(serializers.ModelSerializer):
    password        = serializers.CharField(write_only=True, required=False)
    department_name = serializers.CharField(source='department.name', read_only=True)
    employee_name   = serializers.CharField(source='employee.first_name', read_only=True)
    login_activities = LoginActivitySerializer(many=True, read_only=True)

    class Meta:
        model  = AdminUser
        fields = (
            'id', 'username', 'full_name', 'email', 'role',
            'department', 'department_name',
            'employee', 'employee_name',
            'is_active', 'password', 'created_at',
            'login_activities',
        )
        read_only_fields = ('id', 'created_at')

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        user = AdminUser(**validated_data)
        if password:
            user.set_password(password)
        if user.role in ('HOD', 'HOD_ACCOUNTS'):
            user.must_change_password = True
        # IT Manager gets full Django admin access
        if user.role == 'IT':
            user.is_staff = True
            user.is_superuser = True
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        # Keep is_staff/is_superuser in sync with the IT role
        if instance.role == 'IT':
            instance.is_staff = True
            instance.is_superuser = True
        else:
            # Demote if role was changed away from IT
            instance.is_staff = False
            instance.is_superuser = False
        instance.save()
        return instance