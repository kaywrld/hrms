from django.urls import path
from .views import PayrollListCreateView, PayrollDetailView, PayrollByEmployeeView

urlpatterns = [
    path('',                              PayrollListCreateView.as_view(),  name='payroll-list'),
    path('<int:pk>/',                     PayrollDetailView.as_view(),      name='payroll-detail'),
    path('employee/<int:employee_id>/',   PayrollByEmployeeView.as_view(),  name='payroll-by-employee'),
]