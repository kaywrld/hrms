from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('attendance', '0003_attendancerecord_absence_reason_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='attendancerecord',
            name='late_register_reason',
            field=models.TextField(blank=True, help_text='Reason why attendance is being marked late (for past dates)'),
        ),
        migrations.AddField(
            model_name='attendancerecord',
            name='work_location',
            field=models.CharField(blank=True, help_text='Site or location where the employee worked that day', max_length=255),
        ),
    ]
