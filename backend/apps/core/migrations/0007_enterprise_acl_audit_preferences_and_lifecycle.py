import hashlib
import json

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


CAPABILITY_ALIASES = {
    "read": "correspondence.read",
    "update": "correspondence.update",
    "submit": "correspondence.submit",
    "validate": "correspondence.validate",
    "reject": "correspondence.reject",
    "cancel": "correspondence.cancel",
    "reopen": "correspondence.reopen",
    "archive": "correspondence.archive",
    "sign": "correspondence.sign",
    "manage_acl": "correspondence.manage_acl",
}


SYSTEM_DEFAULTS = {
    "general": {"siteName": "numa", "defaultHome": "dashboard", "allowBusinessAdminPublish": True},
    "security": {"sessionHours": 8, "requireMfaForSensitiveActions": True, "logAuthorizationDenials": True},
    "files": {"maxUploadBytes": 52_428_800, "antivirusRequired": True, "allowedExtensions": ["pdf", "docx", "xlsx", "png", "jpg"]},
    "notifications": {"webEnabled": True, "emailEnabled": True, "fromAddress": ""},
    "internationalization": {"locale": "fr-FR", "timezone": "UTC", "dateFormat": "DD/MM/YYYY"},
    "search": {"ocrEnabled": True, "ocrLanguages": ["fra", "eng"], "indexDocumentText": True},
    "retention": {"defaultYears": 10, "archiveValidatedAfterDays": 365},
    "backups": {"schedule": "0 2 * * *", "dailyRetention": 7, "weeklyRetention": 4, "monthlyRetention": 12, "destination": "both"},
}


def drop_audit_trigger(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute("DROP TRIGGER IF EXISTS numa_audit_event_immutable ON core_auditevent;")


def create_audit_trigger(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute("""
        CREATE OR REPLACE FUNCTION numa_prevent_audit_event_change()
        RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'NUMA audit events are immutable';
        END;
        $$ LANGUAGE plpgsql;
    """)
    schema_editor.execute("""
        DROP TRIGGER IF EXISTS numa_audit_event_immutable ON core_auditevent;
        CREATE TRIGGER numa_audit_event_immutable
        BEFORE UPDATE OR DELETE ON core_auditevent
        FOR EACH ROW EXECUTE FUNCTION numa_prevent_audit_event_change();
    """)


def backfill_enterprise_data(apps, schema_editor):
    AuditEvent = apps.get_model("core", "AuditEvent")
    AuditHead = apps.get_model("core", "AuditHead")
    CapabilityRow = apps.get_model("core", "CorrespondenceAccessGrantCapability")
    Grant = apps.get_model("core", "CorrespondenceAccessGrant")
    ListInstance = apps.get_model("core", "ListInstance")
    SystemSetting = apps.get_model("core", "SystemSetting")

    capability_rows = []
    for grant in Grant.objects.all().iterator():
        capabilities = sorted({
            CAPABILITY_ALIASES.get(str(value).strip(), str(value).strip())
            for value in (grant.capabilities or [])
            if str(value).strip()
        })
        Grant.objects.filter(pk=grant.pk).update(capabilities=capabilities)
        capability_rows.extend(CapabilityRow(grant_id=grant.pk, capability=value) for value in capabilities)
    CapabilityRow.objects.bulk_create(capability_rows, ignore_conflicts=True, batch_size=2_000)

    definition_ids = ListInstance.objects.values_list("definition_id", flat=True).distinct()
    for definition_id in definition_ids:
        active_ids = list(
            ListInstance.objects.filter(definition_id=definition_id, active=True)
            .order_by("-period_key", "-created_at")
            .values_list("id", flat=True)
        )
        ListInstance.objects.filter(definition_id=definition_id).update(active=False, status="closed")
        if active_ids:
            ListInstance.objects.filter(pk=active_ids[0]).update(active=True, status="active")
    for section, values in SYSTEM_DEFAULTS.items():
        SystemSetting.objects.get_or_create(section=section, defaults={"values": values})

    previous_hash = ""
    sequence = 1
    for event in AuditEvent.objects.order_by("created_at", "id").iterator():
        payload = {
            "id": str(event.id),
            "sequence": sequence,
            "actor_id": event.actor_id,
            "actor_snapshot": event.actor_snapshot,
            "action": event.action,
            "resource_type": event.resource_type,
            "resource_id": event.resource_id,
            "metadata": event.metadata,
            "before": event.before,
            "after": event.after,
            "request_id": event.request_id,
            "ip_address": event.ip_address,
            "previous_hash": previous_hash,
            "created_at": event.created_at.isoformat(),
        }
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        event_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        AuditEvent.objects.filter(pk=event.pk).update(
            sequence=sequence,
            previous_hash=previous_hash,
            event_hash=event_hash,
        )
        previous_hash = event_hash
        sequence += 1
    AuditHead.objects.update_or_create(
        singleton=1,
        defaults={"event_hash": previous_hash, "next_sequence": sequence},
    )


class Migration(migrations.Migration):
    dependencies = [("core", "0006_alter_backupjob_destination")]

    operations = [
        migrations.RunPython(drop_audit_trigger, create_audit_trigger),
        migrations.AddField(
            model_name="audithead",
            name="next_sequence",
            field=models.PositiveBigIntegerField(default=1),
        ),
        migrations.AddField(
            model_name="auditevent",
            name="sequence",
            field=models.PositiveBigIntegerField(editable=False, null=True),
        ),
        migrations.CreateModel(
            name="CorrespondenceAccessGrantCapability",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("capability", models.CharField(max_length=80)),
                ("grant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="permission_rows", to="core.correspondenceaccessgrant")),
            ],
            options={
                "ordering": ["capability"],
                "indexes": [models.Index(fields=["capability", "grant"], name="core_corres_capabil_955a9d_idx")],
                "constraints": [models.UniqueConstraint(fields=("grant", "capability"), name="unique_correspondence_grant_capability")],
            },
        ),
        migrations.CreateModel(
            name="SystemSetting",
            fields=[
                ("section", models.SlugField(choices=[("general", "Général"), ("security", "Sécurité"), ("files", "Fichiers"), ("notifications", "Notifications"), ("internationalization", "Internationalisation"), ("search", "Recherche et OCR"), ("retention", "Conservation"), ("backups", "Sauvegardes")], max_length=40, primary_key=True, serialize=False)),
                ("values", models.JSONField(blank=True, default=dict)),
                ("row_version", models.PositiveIntegerField(default=1)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="updated_system_settings", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["section"]},
        ),
        migrations.CreateModel(
            name="UserPreference",
            fields=[
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, primary_key=True, related_name="numa_preferences", serialize=False, to=settings.AUTH_USER_MODEL)),
                ("locale", models.CharField(default="fr-FR", max_length=12)),
                ("timezone", models.CharField(default="UTC", max_length=64)),
                ("default_home", models.CharField(default="dashboard", max_length=40)),
                ("theme", models.CharField(choices=[("system", "Système"), ("light", "Clair"), ("dark", "Sombre")], default="system", max_length=12)),
                ("page_size", models.PositiveSmallIntegerField(default=25)),
                ("compact_mode", models.BooleanField(default=False)),
                ("web_notifications", models.BooleanField(default=True)),
                ("email_notifications", models.BooleanField(default=True)),
                ("settings", models.JSONField(blank=True, default=dict)),
                ("row_version", models.PositiveIntegerField(default=1)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.AddField(model_name="listinstance", name="archived_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="listinstance", name="closed_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="listinstance", name="created_by", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="created_list_instances", to=settings.AUTH_USER_MODEL)),
        migrations.AddField(model_name="listinstance", name="opened_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="listinstance", name="row_version", field=models.PositiveIntegerField(default=1)),
        migrations.AddField(model_name="listinstance", name="scheduled_close_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="listinstance", name="scheduled_open_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="listinstance", name="status", field=models.CharField(choices=[("planned", "Planifiée"), ("active", "Active"), ("closed", "Clôturée"), ("archived", "Archivée")], default="active", max_length=16)),
        migrations.AddField(model_name="listinstance", name="updated_at", field=models.DateTimeField(auto_now=True, default=django.utils.timezone.now), preserve_default=False),
        migrations.AlterModelOptions(name="listinstance", options={"ordering": ["-period_key", "label"]}),
        migrations.AlterModelOptions(name="auditevent", options={"ordering": ["-sequence"]}),
        migrations.RunPython(backfill_enterprise_data, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="auditevent",
            name="sequence",
            field=models.PositiveBigIntegerField(editable=False, unique=True),
        ),
        migrations.AddConstraint(
            model_name="listinstance",
            constraint=models.UniqueConstraint(condition=models.Q(("status", "active")), fields=("definition",), name="unique_active_list_instance"),
        ),
        migrations.RunPython(create_audit_trigger, drop_audit_trigger),
    ]
