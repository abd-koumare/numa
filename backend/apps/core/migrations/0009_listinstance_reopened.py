from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0008_correspondence_list_instance")]

    operations = [
        migrations.AddField(
            model_name="listinstance",
            name="reopened_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="listinstance",
            name="status",
            field=models.CharField(
                choices=[
                    ("planned", "Planifiée"),
                    ("active", "Active"),
                    ("reopened", "Rouverte"),
                    ("closed", "Clôturée"),
                    ("archived", "Archivée"),
                ],
                default="active",
                max_length=16,
            ),
        ),
    ]
