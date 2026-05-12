from rest_framework.permissions import BasePermission

class IsIT(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'IT'

class IsMD(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'MD'

class IsHRM(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'HRM'

class IsHR(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'HR'

class IsHOD(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ('HOD', 'HOD_ACCOUNTS')

class IsAccountsHOD(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'HOD_ACCOUNTS'

class CanViewEmployees(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in (
            'IT', 'MD', 'HRM', 'HR', 'HOD', 'HOD_ACCOUNTS'
        )

class CanEditEmployees(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in (
            'IT', 'HRM', 'HOD_ACCOUNTS'
        )

# IT + HRM can manage admins
class CanManageAdmins(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ('IT', 'HRM')

# Only IT can delete and deactivate
class CanDeleteData(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'IT'