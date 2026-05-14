from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken
from core.permissions import CanManageAdmins, CanDeleteData
from .models import AdminUser, LoginActivity
from .serializers import CustomTokenObtainPairSerializer, AdminUserSerializer, LoginActivitySerializer


def get_client_ip(request):
    x_forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded:
        return x_forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


class LoginView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            try:
                username = request.data.get('username', '')
                user = AdminUser.objects.get(username=username)

                # Decode the refresh token to extract its JTI and store it
                # as the user's single active session identifier.
                from rest_framework_simplejwt.tokens import RefreshToken as RT
                refresh_obj = RT(response.data['refresh'])
                jti = refresh_obj['jti']
                user.active_session_jti = jti
                user.save(update_fields=['active_session_jti'])

                LoginActivity.objects.create(
                    admin=user,
                    event='login',
                    ip_address=get_client_ip(request),
                    user_agent=request.META.get('HTTP_USER_AGENT', '')[:400],
                )
            except AdminUser.DoesNotExist:
                pass
        return response


class LogoutView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        try:
            LoginActivity.objects.create(
                admin=request.user,
                event='logout',
                ip_address=get_client_ip(request),
                user_agent=request.META.get('HTTP_USER_AGENT', '')[:400],
            )
            refresh_token = request.data.get('refresh')
            if refresh_token:
                token = RefreshToken(refresh_token)
                token.blacklist()
        except Exception:
            pass
        finally:
            # Always clear the session JTI regardless of what happened above
            request.user.active_session_jti = None
            request.user.save(update_fields=['active_session_jti'])

        return Response({'message': 'Logged out successfully'}, status=status.HTTP_200_OK)


class ValidatedTokenRefreshView(TokenRefreshView):
    """
    Custom refresh endpoint that rejects tokens whose JTI no longer matches
    the user's stored active_session_jti.  This closes the gap where a user
    who was forced out (e.g. new login from another device set a new JTI) could
    silently keep refreshing their stale token indefinitely.
    """

    def post(self, request, *args, **kwargs):
        raw_refresh = request.data.get('refresh', '')
        if not raw_refresh:
            return Response({'error': 'refresh token is required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Decode without yet validating the full chain — we only need the JTI & user_id
        try:
            incoming = RefreshToken(raw_refresh)
            incoming_jti     = incoming['jti']
            incoming_user_id = incoming['user_id']
        except (TokenError, InvalidToken, KeyError):
            return Response({'error': 'Invalid or expired refresh token.'}, status=status.HTTP_401_UNAUTHORIZED)

        # Reject if the stored JTI no longer matches (session was superseded or cleared)
        try:
            user = AdminUser.objects.get(pk=incoming_user_id)
        except AdminUser.DoesNotExist:
            return Response({'error': 'User not found.'}, status=status.HTTP_401_UNAUTHORIZED)

        if user.active_session_jti != incoming_jti:
            return Response(
                {
                    'error': 'Session is no longer valid. Please log in again.',
                    'code':  'session_invalidated',
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # All good — let SimpleJWT do the real rotation
        response = super().post(request, *args, **kwargs)

        # After rotation the old JTI is blacklisted and a new refresh token is
        # issued.  Update active_session_jti to the new token's JTI so the next
        # refresh still passes the check.
        if response.status_code == 200 and 'refresh' in response.data:
            try:
                new_token = RefreshToken(response.data['refresh'])
                user.active_session_jti = new_token['jti']
                user.save(update_fields=['active_session_jti'])
            except (TokenError, KeyError):
                pass  # Non-fatal — token is still valid for this request

        return response


class MeView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        serializer = AdminUserSerializer(request.user)
        return Response(serializer.data)


class AdminUserListCreateView(generics.ListCreateAPIView):
    permission_classes = (CanManageAdmins,)
    serializer_class   = AdminUserSerializer

    def get_queryset(self):
        return AdminUser.objects.all().order_by('full_name')


class AdminUserDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = (CanManageAdmins,)
    serializer_class   = AdminUserSerializer
    queryset           = AdminUser.objects.all()

    def destroy(self, request, *args, **kwargs):
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
                {'message': f"{target.full_name}'s account has been {state}.", 'is_active': target.is_active},
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
                return Response({'error': 'new_password is required.'}, status=status.HTTP_400_BAD_REQUEST)
            if len(new_password) < 8:
                return Response({'error': 'Password must be at least 8 characters.'}, status=status.HTTP_400_BAD_REQUEST)

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
            return Response({'error': 'All three fields are required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not user.check_password(current_password):
            return Response({'error': 'Current password is incorrect.'}, status=status.HTTP_400_BAD_REQUEST)
        if new_password != confirm_password:
            return Response({'error': 'New password and confirm password do not match.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(new_password) < 8:
            return Response({'error': 'New password must be at least 8 characters.'}, status=status.HTTP_400_BAD_REQUEST)
        if current_password == new_password:
            return Response({'error': 'New password must be different from your current password.'}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.must_change_password = False
        user.save()
        return Response({'message': 'Password changed successfully. Please log in again.'}, status=status.HTTP_200_OK)


class AdminLoginActivityView(APIView):
    """Fetch login activity for a specific admin (IT only)"""
    permission_classes = (CanManageAdmins,)

    def get(self, request, pk):
        try:
            admin = AdminUser.objects.get(pk=pk)
            activities = LoginActivity.objects.filter(admin=admin).order_by('-timestamp')[:100]
            serializer = LoginActivitySerializer(activities, many=True)
            return Response(serializer.data)
        except AdminUser.DoesNotExist:
            return Response({'error': 'Admin not found.'}, status=status.HTTP_404_NOT_FOUND)


class AdminSessionAttendanceView(APIView):
    """
    Return attendance records marked by a specific admin during a login session.
    Query params:
      login_time  – ISO datetime of the login event
      logout_time – ISO datetime of the logout event (optional; defaults to now)
    """
    permission_classes = (CanManageAdmins,)

    def get(self, request, pk):
        from attendance.models import AttendanceRecord
        from attendance.serializers import AttendanceRecordSerializer
        from django.utils.dateparse import parse_datetime
        from django.utils import timezone

        try:
            admin = AdminUser.objects.get(pk=pk)
        except AdminUser.DoesNotExist:
            return Response({'error': 'Admin not found.'}, status=status.HTTP_404_NOT_FOUND)

        login_str  = request.query_params.get('login_time')
        logout_str = request.query_params.get('logout_time')

        if not login_str:
            return Response({'error': 'login_time is required.'}, status=status.HTTP_400_BAD_REQUEST)

        login_time  = parse_datetime(login_str)
        logout_time = parse_datetime(logout_str) if logout_str else timezone.now()

        if not login_time:
            return Response({'error': 'Invalid login_time format.'}, status=status.HTTP_400_BAD_REQUEST)

        records = AttendanceRecord.objects.filter(
            marked_by=admin.username,
            created_at__gte=login_time,
            created_at__lte=logout_time,
        ).select_related('employee', 'shift').order_by('employee__last_name')

        serializer = AttendanceRecordSerializer(records, many=True)
        return Response(serializer.data)