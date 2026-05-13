from .views import (
    LoginView, LogoutView, MeView,
    AdminUserListCreateView, AdminUserDetailView,
    ResetUserPasswordView, ChangeOwnPasswordView,
    DeactivateAdminView, AdminLoginActivityView,
    AdminSessionAttendanceView,
)
from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

urlpatterns = [
    path('login/',                            LoginView.as_view(),              name='login'),
    path('logout/',                           LogoutView.as_view(),             name='logout'),
    path('token/refresh/',                    TokenRefreshView.as_view(),       name='token_refresh'),
    path('me/',                               MeView.as_view(),                 name='me'),
    path('me/change-password/',               ChangeOwnPasswordView.as_view(),  name='change-own-password'),
    path('admins/',                           AdminUserListCreateView.as_view(),name='admin-list'),
    path('admins/<int:pk>/',                  AdminUserDetailView.as_view(),    name='admin-detail'),
    path('admins/<int:pk>/reset-password/',   ResetUserPasswordView.as_view(),  name='reset-user-password'),
    path('admins/<int:pk>/deactivate/',       DeactivateAdminView.as_view(),    name='deactivate-admin'),
    path('admins/<int:pk>/activity/',         AdminLoginActivityView.as_view(), name='admin-activity'),
    path('admins/<int:pk>/session-attendance/', AdminSessionAttendanceView.as_view(), name='admin-session-attendance'),
]