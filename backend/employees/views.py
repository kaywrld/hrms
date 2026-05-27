from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from core.permissions import CanViewEmployees, CanEditEmployees, IsHRM, IsHR
from .models import Department, Employee, AcademicQualification, EmployeeStatusLog
from .serializers import (
    DepartmentSerializer, EmployeeSerializer,
    EmployeeListSerializer, AcademicQualificationSerializer,
    EmployeeStatusLogSerializer
)

class DepartmentListCreateView(generics.ListCreateAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class   = DepartmentSerializer
    queryset           = Department.objects.all().order_by('name')


class DepartmentDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = (IsHRM,)
    serializer_class   = DepartmentSerializer
    queryset           = Department.objects.all()

    def destroy(self, request, *args, **kwargs):
        if request.user.role != 'IT':
            return Response(
                {'error': 'Only the IT Manager can delete records.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().destroy(request, *args, **kwargs)


class EmployeeListCreateView(generics.ListCreateAPIView):
    permission_classes = (CanViewEmployees,)

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return EmployeeSerializer
        return EmployeeListSerializer

    def get_queryset(self):
        user = self.request.user
        # HODs only see their own department
        if user.role == 'HOD':
            return Employee.objects.filter(department=user.department)
        return Employee.objects.all().order_by('last_name')

    def create(self, request, *args, **kwargs):
        # IT, HRM, and HR can add employees
        if request.user.role not in ('IT', 'HRM', 'HR'):
            return Response(
                {'error': 'You do not have permission to add employees.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().create(request, *args, **kwargs)


class EmployeeDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = (CanViewEmployees,)
    serializer_class   = EmployeeSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role == 'HOD':
            return Employee.objects.filter(department=user.department)
        return Employee.objects.all()

    def update(self, request, *args, **kwargs):
        if not request.user.can_edit:
            return Response(
                {'error': 'You do not have permission to edit employees.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if request.user.role != 'IT':
            return Response(
                {'error': 'Only the IT Manager can delete records.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().destroy(request, *args, **kwargs)


class EmployeeStatusChangeView(APIView):
    permission_classes = (CanEditEmployees,)

    def post(self, request, pk):
        try:
            employee   = Employee.objects.get(pk=pk)
            new_status = request.data.get('status')
            reason     = request.data.get('reason', '')

            if new_status not in dict(Employee.STATUS_CHOICES):
                return Response({'error': 'Invalid status.'}, status=status.HTTP_400_BAD_REQUEST)

            if new_status in ('dismissed', 'retired', 'suspended') and not reason:
                return Response({'error': 'A reason is required for this status.'}, status=status.HTTP_400_BAD_REQUEST)

            # Log the change
            EmployeeStatusLog.objects.create(
                employee   = employee,
                old_status = employee.status,
                new_status = new_status,
                reason     = reason,
                changed_by = request.user.username,
            )

            employee.status            = new_status
            employee.status_reason     = reason
            employee.status_changed_at = timezone.now()
            employee.save()

            return Response({'message': f'Status updated to {new_status}.'}, status=status.HTTP_200_OK)

        except Employee.DoesNotExist:
            return Response({'error': 'Employee not found.'}, status=status.HTTP_404_NOT_FOUND)


class AcademicQualificationView(generics.ListCreateAPIView):
    permission_classes = (CanViewEmployees,)
    serializer_class   = AcademicQualificationSerializer

    def get_queryset(self):
        return AcademicQualification.objects.filter(employee_id=self.kwargs['pk'])

    def perform_create(self, serializer):
        employee = Employee.objects.get(pk=self.kwargs['pk'])
        serializer.save(employee=employee)