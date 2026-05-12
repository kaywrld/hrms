from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from employees.models import Department

class AdminUserManager(BaseUserManager):
    def create_user(self, username, password=None, **extra_fields):
        if not username:
            raise ValueError('Username is required')
        user = self.model(username=username, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, username, password=None, **extra_fields):
        extra_fields.setdefault('role', 'HRM')
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        return self.create_user(username, password, **extra_fields)


class AdminUser(AbstractBaseUser, PermissionsMixin):
    ROLE_CHOICES = [
        ('IT',          'IT Manager'),
        ('MD',          'Managing Director'),
        ('HRM',         'HR Manager'),
        ('HR',          'Standard HR'),
        ('HOD',         'Head of Department'),
        ('HOD_ACCOUNTS','Accounts HOD'),
    ]

    username    = models.CharField(max_length=100, unique=True)
    full_name   = models.CharField(max_length=200)
    email       = models.EmailField(unique=True)
    role        = models.CharField(max_length=20, choices=ROLE_CHOICES)
    department  = models.ForeignKey(
                    Department, on_delete=models.SET_NULL,
                    null=True, blank=True,
                    help_text='Required for HOD roles'
                  )
    is_active   = models.BooleanField(default=True)
    is_staff    = models.BooleanField(default=False)
    created_at  = models.DateTimeField(auto_now_add=True)

    objects = AdminUserManager()

    USERNAME_FIELD  = 'username'
    REQUIRED_FIELDS = ['email', 'full_name', 'role']

    def __str__(self):
        return f"{self.full_name} ({self.get_role_display()})"

    # Permission helpers used throughout the system
    @property
    def can_edit(self):
        return self.role in ('IT', 'HRM', 'HOD_ACCOUNTS')

    @property
    def can_delete(self):
        return self.role == 'IT'   # Only IT Manager can delete

    @property
    def can_create_admins(self):
        return self.role in ('IT', 'HRM')

    @property
    def can_deactivate_admins(self):
        return self.role == 'IT'

    @property
    def sees_all_departments(self):
        return self.role in ('IT', 'MD', 'HRM', 'HR', 'HOD_ACCOUNTS')