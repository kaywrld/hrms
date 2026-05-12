from django.urls import path
from .views import PayrollListCreateView, PayrollDetailView

urlpatterns = [
    path('',          PayrollListCreateView.as_view(), name='payroll-list'),
    path('<int:pk>/', PayrollDetailView.as_view(),     name='payroll-detail'),
]