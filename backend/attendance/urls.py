from django.urls import path
from .views import (
    ShiftListView, AttendanceListCreateView, AttendanceDetailView,
    WorkLocationListCreateView, RegisterMonthView, RegisterBulkMarkView,
)

urlpatterns = [
    path('shifts/',      ShiftListView.as_view(),         name='shift-list'),
    path('',             AttendanceListCreateView.as_view(),name='attendance-list'),
    path('<int:pk>/',    AttendanceDetailView.as_view(),  name='attendance-detail'),
    path('locations/',   WorkLocationListCreateView.as_view(), name='work-location-list'),
    path('register/',      RegisterMonthView.as_view(),    name='register-month'),
    path('register/bulk/', RegisterBulkMarkView.as_view(), name='register-bulk'),
]