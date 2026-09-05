from django.db import migrations
from django.db.models import Value
from django.db.models.functions import Concat, Substr


def fix_notification_paths(apps, schema_editor):
    notifications = apps.get_model("core", "Notification").objects.using(schema_editor.connection.alias)
    for old, new in (("externals", "externes"), ("internals", "internes")):
        prefix = f"/courriers/{old}/"
        notifications.filter(path__startswith=prefix).update(
            path=Concat(Value(f"/courriers/{new}/"), Substr("path", len(prefix) + 1)),
        )


class Migration(migrations.Migration):
    dependencies = [("core", "0010_runtime_configuration")]

    operations = [migrations.RunPython(fix_notification_paths, migrations.RunPython.noop)]
