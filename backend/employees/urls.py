from django.urls import path
from .views import (
    DepartmentListCreateView, DepartmentDetailView,
    SiteListCreateView, SiteDetailView,
    EmployeeListCreateView, EmployeeDetailView,
    EmployeeStatusChangeView, AcademicQualificationView,
    EmployeeBulkImportView, EmployeeBulkImportTemplateView,
    EmployeeExportBySiteView,
)

urlpatterns = [
    path('departments/',              DepartmentListCreateView.as_view(), name='department-list'),
    path('departments/<int:pk>/',     DepartmentDetailView.as_view(),     name='department-detail'),
    path('sites/',                    SiteListCreateView.as_view(),       name='site-list'),
    path('sites/<int:pk>/',           SiteDetailView.as_view(),           name='site-detail'),
    path('bulk-import/',              EmployeeBulkImportView.as_view(),         name='employee-bulk-import'),
    path('bulk-import/template/',     EmployeeBulkImportTemplateView.as_view(), name='employee-bulk-import-template'),
    path('export-by-site/',           EmployeeExportBySiteView.as_view(),       name='employee-export-by-site'),
    path('',                          EmployeeListCreateView.as_view(),   name='employee-list'),
    path('<int:pk>/',                 EmployeeDetailView.as_view(),       name='employee-detail'),
    path('<int:pk>/status/',          EmployeeStatusChangeView.as_view(), name='employee-status'),
    path('<int:pk>/qualifications/',  AcademicQualificationView.as_view(),name='employee-qualifications'),
]