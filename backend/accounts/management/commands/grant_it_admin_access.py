"""
Grants Django admin (is_staff + is_superuser) access to all IT Manager accounts.

Run once after deploying the fix, or whenever a new IT account needs admin access:

    python manage.py grant_it_admin_access

    # Or target a specific username:
    python manage.py grant_it_admin_access --username it_user
"""

from django.core.management.base import BaseCommand
from accounts.models import AdminUser


class Command(BaseCommand):
    help = "Grant Django admin access (is_staff + is_superuser) to IT Manager accounts."

    def add_arguments(self, parser):
        parser.add_argument(
            "--username",
            type=str,
            default=None,
            help="Target a specific username (default: all IT role users).",
        )

    def handle(self, *args, **options):
        username = options.get("username")

        qs = AdminUser.objects.filter(role="IT")
        if username:
            qs = qs.filter(username=username)

        if not qs.exists():
            self.stderr.write(self.style.WARNING("No IT Manager accounts found."))
            return

        updated = 0
        for user in qs:
            if not user.is_staff or not user.is_superuser:
                user.is_staff = True
                user.is_superuser = True
                user.save(update_fields=["is_staff", "is_superuser"])
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  ✓ Granted admin access to '{user.username}' ({user.full_name})"
                    )
                )
                updated += 1
            else:
                self.stdout.write(f"  — '{user.username}' already has admin access.")

        if updated:
            self.stdout.write(
                self.style.SUCCESS(
                    f"\nDone. {updated} account(s) updated. "
                    f"Access Django admin at: http://localhost:8000/admin/"
                )
            )
        else:
            self.stdout.write("All IT accounts already had admin access — nothing changed.")