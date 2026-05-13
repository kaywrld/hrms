from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import AdminUser

@admin.register(AdminUser)
class AdminUserAdmin(UserAdmin):
    list_display = ('username', 'full_name', 'email', 'role', 'department', 'is_active')
    list_filter = ('role', 'is_active')
    search_fields = ('username', 'full_name', 'email')
    ordering = ('username',)

    fieldsets = (
        (None,              {'fields': ('username', 'password')}),
        ('Personal Info',   {'fields': ('full_name', 'email')}),
        ('Role & Access',   {'fields': ('role', 'department')}),
        ('Permissions',     {'fields': ('is_active', 'is_staff', 'is_superuser')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('username', 'full_name', 'email', 'role', 'department', 'password1', 'password2'),
        }),
    )