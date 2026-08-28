import datetime

import django.db.models.deletion
from django.db import migrations, models
from django.utils import timezone


REGISTRIES = {
    "internal": "courriers-internes",
    "external": "courriers-externes",
}


def create_registry_instances(apps, schema_editor):
    ConfigurationDefinition = apps.get_model("core", "ConfigurationDefinition")
    Correspondence = apps.get_model("core", "Correspondence")
    ListInstance = apps.get_model("core", "ListInstance")
    current_year = timezone.now().year

    for registry, slug in REGISTRIES.items():
        definition = ConfigurationDefinition.objects.filter(
            kind="list",
            slug=slug,
            current_version__isnull=False,
        ).first()
        if definition is None:
            continue
        years = set(Correspondence.objects.filter(registry=registry).dates("received_at", "year"))
        years.add(datetime.date(current_year, 1, 1))
        existing_active = ListInstance.objects.filter(definition_id=definition.pk, status="active").first()
        for year_date in sorted(years):
            year = year_date.year
            desired_status = "active" if year == current_year and existing_active is None else "closed"
            instance, _ = ListInstance.objects.get_or_create(
                definition_id=definition.pk,
                period_key=str(year),
                defaults={
                    "label": f"{definition.name} {year}",
                    "configuration_version_id": definition.current_version_id,
                    "status": desired_status,
                    "active": desired_status == "active",
                    "opened_at": timezone.now() if desired_status == "active" else None,
                    "closed_at": timezone.now() if desired_status == "closed" else None,
                },
            )
            if desired_status == "active":
                existing_active = instance
            Correspondence.objects.filter(
                registry=registry,
                received_at__year=year,
                list_instance__isnull=True,
            ).update(list_instance_id=instance.pk)


class Migration(migrations.Migration):
    dependencies = [("core", "0007_enterprise_acl_audit_preferences_and_lifecycle")]

    operations = [
        migrations.AddField(
            model_name="correspondence",
            name="list_instance",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="correspondences", to="core.listinstance"),
        ),
        migrations.RunPython(create_registry_instances, migrations.RunPython.noop),
    ]
