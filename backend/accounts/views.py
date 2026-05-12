from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from core.permissions import CanManageAdmins, CanDeleteData
from .models import AdminUser
from .serializers import CustomTokenObtainPairSerializer, AdminUserSerializer

class LoginView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


class LogoutView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        try:
            refresh_token = request.data['refresh']
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({'message': 'Logged out successfully'}, status=status.HTTP_200_OK)
        except Exception:
            return Response({'error': 'Invalid token'}, status=status.HTTP_400_BAD_REQUEST)


class MeView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        serializer = AdminUserSerializer(request.user)
        return Response(serializer.data)


class AdminUserListCreateView(generics.ListCreateAPIView):
    permission_classes = (CanManageAdmins,)
    serializer_class   = AdminUserSerializer
    queryset           = AdminUser.objects.all().order_by('full_name')


class AdminUserDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = (CanManageAdmins,)
    serializer_class   = AdminUserSerializer
    queryset           = AdminUser.objects.all()

    def destroy(self, request, *args, **kwargs):
        # Only IT Manager can delete admins
        if request.user.role != 'IT':
            return Response(
                {'error': 'Only the IT Manager can delete admin accounts.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().destroy(request, *args, **kwargs)


class DeactivateAdminView(APIView):
    """IT Manager deactivates/reactivates an admin account"""
    permission_classes = (CanDeleteData,)

    def post(self, request, pk):
        try:
            target = AdminUser.objects.get(pk=pk)
            if target == request.user:
                return Response(
                    {'error': 'You cannot deactivate your own account.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            target.is_active = not target.is_active
            target.save()
            state = "activated" if target.is_active else "deactivated"
            return Response(
                {'message': f"{target.full_name}'s account has been {state}."},
                status=status.HTTP_200_OK
            )
        except AdminUser.DoesNotExist:
            return Response({'error': 'Admin not found.'}, status=status.HTTP_404_NOT_FOUND)


class ResetUserPasswordView(APIView):
    """IT Manager or HRM resets another admin's password"""
    permission_classes = (CanManageAdmins,)

    def post(self, request, pk):
        try:
            target_user  = AdminUser.objects.get(pk=pk)
            new_password = request.data.get('new_password', '').strip()

            if not new_password:
                return Response(
                    {'error': 'new_password is required.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if len(new_password) < 8:
                return Response(
                    {'error': 'Password must be at least 8 characters.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            target_user.set_password(new_password)
            target_user.save()
            return Response(
                {'message': f"Password for {target_user.full_name} reset successfully."},
                status=status.HTTP_200_OK
            )
        except AdminUser.DoesNotExist:
            return Response({'error': 'Admin user not found.'}, status=status.HTTP_404_NOT_FOUND)


class ChangeOwnPasswordView(APIView):
    """Any logged-in admin changes their own password"""
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        user             = request.user
        current_password = request.data.get('current_password', '').strip()
        new_password     = request.data.get('new_password', '').strip()
        confirm_password = request.data.get('confirm_password', '').strip()

        if not all([current_password, new_password, confirm_password]):
            return Response(
                {'error': 'All three fields are required: current_password, new_password, confirm_password.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not user.check_password(current_password):
            return Response(
                {'error': 'Current password is incorrect.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if new_password != confirm_password:
            return Response(
                {'error': 'New password and confirm password do not match.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if len(new_password) < 8:
            return Response(
                {'error': 'New password must be at least 8 characters.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if current_password == new_password:
            return Response(
                {'error': 'New password must be different from your current password.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user.set_password(new_password)
        user.save()

        return Response(
            {'message': 'Password changed successfully. Please log in again.'},
            status=status.HTTP_200_OK
        )