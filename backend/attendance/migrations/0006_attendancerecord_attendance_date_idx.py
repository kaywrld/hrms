from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('attendance', '0005_worklocation'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='attendancerecord',
            index=models.Index(fields=['date'], name='attendance_date_idx'),
        ),
    ]
