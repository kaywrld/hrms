from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import AdminUser

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        # Embed user info directly into the JWT payload
        token['full_name'] = user.full_name
        token['role']      = user.role
        token['email']     = user.email
        if user.department:
            token['department_id']   = user.department.id
            token['department_name'] = user.department.name
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        dept = self.user.department
        data['user'] = {
            'id':         self.user.id,
            'username':   self.user.username,
            'full_name':  self.user.full_name,
            'email':      self.user.email,
            'role':       self.user.role,
            'department': dept.name if dept is not None else None,  # ← guard against None
        }
        return data


class AdminUserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model  = AdminUser
        fields = ('id', 'username', 'full_name', 'email', 'role', 'department', 'is_active', 'password', 'created_at')
        read_only_fields = ('id', 'created_at')

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = AdminUser(**validated_data)
        user.set_password(password)
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