"""
Management command to clear stuck active_session_jti for one or all admin users.

Usage:
    # Clear ALL stuck sessions (use after a server crash / bad logout):
    python manage.py clear_sessions

    # Clear session for a specific username only:
    python manage.py clear_sessions --username hrm_user
"""

from django.core.management.base import BaseCommand
from accounts.models import AdminUser


class Command(BaseCommand):
    help = "Clear stuck active_session_jti so locked-out users can log back in."

    def add_arguments(self, parser):
        parser.add_argument(
            "--username",
            type=str,
            default=None,
            help="Clear session for this specific username only (omit to clear all).",
        )

    def handle(self, *args, **options):
        username = options.get("username")

        if username:
            try:
                user = AdminUser.objects.get(username=username)
                old_jti = user.active_session_jti
                user.active_session_jti = None
                user.last_activity = None
                user.save(update_fields=["active_session_jti", "last_activity"])
                if old_jti:
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"Cleared session for '{username}' (was {old_jti[:16]}…)"
                        )
                    )
                else:
                    self.stdout.write(f"'{username}' had no active session — nothing to clear.")
            except AdminUser.DoesNotExist:
                self.stderr.write(self.style.ERROR(f"No user found with username '{username}'."))
        else:
            stuck = AdminUser.objects.filter(active_session_jti__isnull=False)
            count = stuck.count()
            if count == 0:
                self.stdout.write("No stuck sessions found.")
                return
            for user in stuck:
                self.stdout.write(f"  Clearing: {user.username} ({user.role})")
            stuck.update(active_session_jti=None, last_activity=None)
            self.stdout.write(self.style.SUCCESS(f"Cleared {count} stuck session(s)."))