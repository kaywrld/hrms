from django.urls import path
from .views import (
    PayrollListCreateView, PayrollDetailView, PayrollByEmployeeView, PayrollAdjustmentListCreateView,
    PayrollAdjustmentDetailView,
    LongTermDeductionListCreateView, LongTermDeductionDetailView, PayrollComputedListView,
)

urlpatterns = [
    path('computed/',                     PayrollComputedListView.as_view(), name='payroll-computed'),
    path('',                              PayrollListCreateView.as_view(),  name='payroll-list'),
    path('<int:pk>/',                     PayrollDetailView.as_view(),      name='payroll-detail'),
    path('employee/<int:employee_id>/',   PayrollByEmployeeView.as_view(),  name='payroll-by-employee'),
    path('payroll-adjustments/', PayrollAdjustmentListCreateView.as_view()),
    path('payroll-adjustments/<int:pk>/', PayrollAdjustmentDetailView.as_view()),
    path('long-term-deductions/',         LongTermDeductionListCreateView.as_view(), name='long-term-deduction-list'),
    path('long-term-deductions/<int:pk>/', LongTermDeductionDetailView.as_view(),     name='long-term-deduction-detail'),
]