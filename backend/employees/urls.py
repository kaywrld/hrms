from django.urls import path
from .views import (
    DepartmentListCreateView, DepartmentDetailView,
    EmployeeListCreateView, EmployeeDetailView,
    EmployeeStatusChangeView, AcademicQualificationView
)

urlpatterns = [
    path('departments/',              DepartmentListCreateView.as_view(), name='department-list'),
    path('departments/<int:pk>/',     DepartmentDetailView.as_view(),     name='department-detail'),
    path('',                          EmployeeListCreateView.as_view(),   name='employee-list'),
    path('<int:pk>/',                 EmployeeDetailView.as_view(),       name='employee-detail'),
    path('<int:pk>/status/',          EmployeeStatusChangeView.as_view(), name='employee-status'),
    path('<int:pk>/qualifications/',  AcademicQualificationView.as_view(),name='employee-qualifications'),
]