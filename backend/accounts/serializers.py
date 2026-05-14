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
        # Embed the refresh token's JTI so the backend can verify it later
        token['session_jti'] = str(token['jti'])
        return token

    def validate(self, attrs):
        from django.contrib.auth import get_user_model
        from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
        User = get_user_model()

        # Validate credentials FIRST — this raises "invalid username/password" if wrong
        data = super().validate(attrs)

        # Only after credentials pass, check the session lock
        try:
            candidate = User.objects.get(username=attrs.get('username', ''))
            if candidate.active_session_jti:
                is_still_active = OutstandingToken.objects.filter(
                    jti=candidate.active_session_jti
                ).exclude(
                    blacklistedtoken__isnull=False
                ).exists()

                if not is_still_active:
                    candidate.active_session_jti = None
                    candidate.save(update_fields=['active_session_jti'])
                else:
                    raise serializers.ValidationError({
                        'detail': 'This account is currently logged in on another device. '
                                'Please log out from that device first and try again.',
                        'code': 'already_logged_in',
                    })
        except User.DoesNotExist:
            pass

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
        # HOD accounts must change their initial password on first login
        if user.role in ('HOD', 'HOD_ACCOUNTS'):
            user.must_change_password = True
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance