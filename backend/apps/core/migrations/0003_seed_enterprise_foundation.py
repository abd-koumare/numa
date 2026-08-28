import hashlib
import json

from django.db import migrations, models


ROLE_DEFINITIONS = {
    "super-admin": ("Super administrateur", "Administration technique, restauration et sécurité.", ["*"]),
    "admin": ("Administrateur", "Administration fonctionnelle, identités, contenus et intégrations.", [
        "correspondence.read", "correspondence.read_all", "correspondence.create", "correspondence.update",
        "correspondence.submit", "correspondence.validate", "correspondence.reject", "correspondence.cancel",
        "correspondence.reopen", "correspondence.archive", "correspondence.sign", "correspondence.manage_acl",
        "document.upload", "document.download", "task.read", "task.act", "task.assign", "search.use",
        "configuration.read", "configuration.manage", "configuration.publish", "identity.read", "identity.manage",
        "audit.read", "audit.export", "notification.read", "transfer.import", "transfer.export",
        "integration.manage", "system.manage",
    ]),
    "configurateur": ("Configurateur", "Formulaires, vues, règles, workflows et navigation.", [
        "configuration.read", "configuration.manage", "configuration.publish", "correspondence.read",
        "document.download", "search.use", "notification.read",
    ]),
    "gestionnaire": ("Gestionnaire", "Création, enregistrement et suivi des éléments métier.", [
        "correspondence.read", "correspondence.create", "correspondence.update", "correspondence.submit",
        "correspondence.cancel", "correspondence.reopen", "correspondence.archive", "correspondence.manage_acl",
        "document.upload", "document.download", "task.read", "task.act", "task.assign", "search.use",
        "notification.read", "transfer.import", "transfer.export",
    ]),
    "validateur": ("Validateur", "Approbation, rejet et signature selon habilitation.", [
        "correspondence.read", "correspondence.validate", "correspondence.reject", "correspondence.sign",
        "document.download", "task.read", "task.act", "search.use", "notification.read",
    ]),
    "utilisateur": ("Utilisateur", "Création et consultation dans son périmètre.", [
        "correspondence.read", "correspondence.create", "correspondence.update", "correspondence.submit",
        "document.upload", "document.download", "task.read", "search.use", "notification.read",
    ]),
    "lecteur": ("Lecteur", "Consultation uniquement dans son périmètre.", [
        "correspondence.read", "document.download", "search.use", "notification.read",
    ]),
    "auditeur": ("Auditeur", "Consultation globale et journal d’audit sans mutation métier.", [
        "correspondence.read", "correspondence.read_all", "document.download", "search.use", "audit.read",
        "audit.export", "notification.read", "transfer.export",
    ]),
}

ALL_CAPABILITIES = sorted({capability for _, _, values in ROLE_DEFINITIONS.values() for capability in values if capability != "*"} | {"backup.manage"})


CONFIGURATIONS = [
    ("branding", "site-branding", "Identité du site", {
        "organizationName": "ORGATECH", "applicationName": "NUMA", "logoDataUrl": None,
        "logoFileName": None, "logoMimeType": None, "faviconDataUrl": None,
        "primaryColor": "#123E7C", "accentColor": "#20C4C7", "bannerUrl": "",
        "fontFamily": "NUMA", "footerText": "Tous droits réservés à Koogin SAS", "defaultHome": "dashboard",
    }),
    ("numbering", "correspondence-numbering", "Numérotation des courriers", {
        "format": "{SERVICE}/{SEQUENCE:0000}/{ANNEE}", "counterScope": "service-year",
        "resetPeriod": "yearly", "sharedAcrossRegistries": True, "assignmentTrigger": "submission",
        "cancelledNumberPolicy": "keep", "nextSequence": 1,
    }),
    ("navigation", "main-navigation", "Navigation principale", {"entries": [
        {"id": "nav-home", "label": "Accueil", "path": "/", "visibility": "Tous les utilisateurs", "enabled": True},
        {"id": "nav-mail", "label": "Courriers", "path": "/courriers", "visibility": "Utilisateurs autorisés", "enabled": True},
        {"id": "nav-tasks", "label": "Mes tâches", "path": "/taches", "visibility": "Utilisateurs autorisés", "enabled": True},
        {"id": "nav-admin", "label": "Administration", "path": "/administration", "visibility": "Administrateurs", "enabled": True},
    ]}),
    ("signature_policy", "default-signature-policy", "Politique de signature", {
        "internalValidationEnabled": True, "graphicSignatureEnabled": True, "digitalSignatureEnabled": False,
    }),
]


def seed_enterprise_foundation(apps, schema_editor):
    AccessGroup = apps.get_model("core", "AccessGroup")
    AccessRole = apps.get_model("core", "AccessRole")
    AuditEvent = apps.get_model("core", "AuditEvent")
    AuditHead = apps.get_model("core", "AuditHead")
    ConfigurationDefinition = apps.get_model("core", "ConfigurationDefinition")
    ConfigurationVersion = apps.get_model("core", "ConfigurationVersion")
    Correspondence = apps.get_model("core", "Correspondence")
    CorrespondenceAccessGrant = apps.get_model("core", "CorrespondenceAccessGrant")
    Document = apps.get_model("core", "Document")
    DocumentVersion = apps.get_model("core", "DocumentVersion")
    GroupMembership = apps.get_model("core", "GroupMembership")
    OrganizationSettings = apps.get_model("core", "OrganizationSettings")
    UserProfile = apps.get_model("core", "UserProfile")
    UserRoleAssignment = apps.get_model("core", "UserRoleAssignment")
    WorkflowInstance = apps.get_model("core", "WorkflowInstance")
    User = apps.get_model("auth", "User")

    roles = {}
    for slug, (label, description, capabilities) in ROLE_DEFINITIONS.items():
        if capabilities == ["*"]:
            capabilities = ALL_CAPABILITIES
        role, _ = AccessRole.objects.update_or_create(
            slug=slug,
            defaults={
                "label": label,
                "description": description,
                "capabilities": capabilities,
                "protected": slug in {"super-admin", "admin"},
                "active": True,
            },
        )
        roles[slug] = role

    service_groups = {}
    for profile in UserProfile.objects.select_related("organization_unit").iterator():
        for slug in profile.roles or []:
            if slug in roles:
                UserRoleAssignment.objects.get_or_create(profile=profile, role=roles[slug], source="migration")
        if profile.organization_unit_id:
            external_id = f"service:{profile.organization_unit_id}"
            group, _ = AccessGroup.objects.get_or_create(
                source="local",
                external_id=external_id,
                defaults={
                    "name": f"NUMA-{profile.organization_unit.code}",
                    "description": f"Membres du service {profile.organization_unit.name}",
                    "organization_unit_id": profile.organization_unit_id,
                },
            )
            service_groups[profile.organization_unit_id] = group
            GroupMembership.objects.get_or_create(profile=profile, group=group, defaults={"source": "manual"})

    owner_capabilities = [
        "read", "update", "submit", "cancel", "reopen", "archive", "manage_acl", "document.upload", "document.download",
    ]
    service_capabilities = ["read", "update", "submit", "document.upload", "document.download"]
    for item in Correspondence.objects.select_related("responsible_service").iterator():
        CorrespondenceAccessGrant.objects.get_or_create(
            correspondence=item,
            user_id=item.created_by_id,
            source="owner",
            defaults={"capabilities": owner_capabilities, "created_by_id": item.created_by_id},
        )
        group = service_groups.get(item.responsible_service_id)
        if group is None:
            group, _ = AccessGroup.objects.get_or_create(
                source="local",
                external_id=f"service:{item.responsible_service_id}",
                defaults={
                    "name": f"NUMA-{item.responsible_service.code}",
                    "description": f"Membres du service {item.responsible_service.name}",
                    "organization_unit_id": item.responsible_service_id,
                },
            )
            service_groups[item.responsible_service_id] = group
        CorrespondenceAccessGrant.objects.get_or_create(
            correspondence=item,
            group=group,
            source="service",
            defaults={"capabilities": service_capabilities, "created_by_id": item.created_by_id},
        )
        if item.status != "draft":
            WorkflowInstance.objects.get_or_create(
                correspondence=item,
                defaults={
                    "status": "completed" if item.status in {"validated", "signed", "archived"} else "running",
                    "current_step": item.status,
                    "started_by_id": item.created_by_id,
                },
            )

    for version in DocumentVersion.objects.filter(document__isnull=True).order_by("created_at", "id").iterator():
        document = Document.objects.create(
            correspondence_id=version.correspondence_id,
            title=version.filename,
            kind="attachment",
            active_version_number=1,
            created_by_id=version.created_by_id,
        )
        version.document_id = document.id
        version.version = 1
        version.save(update_fields=["document", "version"])

    configured = UserProfile.objects.exists() or Correspondence.objects.exists()
    OrganizationSettings.objects.update_or_create(
        singleton=1,
        defaults={
            "organization_name": "ORGATECH",
            "application_name": "NUMA",
            "primary_color": "#123E7C",
            "accent_color": "#20C4C7",
            "footer_text": "Tous droits réservés à Koogin SAS",
            "configured": configured,
        },
    )

    initial_author = User.objects.order_by("id").first()
    for kind, slug, name, data in CONFIGURATIONS:
        definition, _ = ConfigurationDefinition.objects.get_or_create(
            kind=kind,
            slug=slug,
            defaults={"name": name, "created_by_id": initial_author.pk if initial_author else None},
        )
        version, _ = ConfigurationVersion.objects.get_or_create(
            definition=definition,
            version=1,
            defaults={
                "state": "published",
                "data": data,
                "created_by_id": initial_author.pk if initial_author else None,
                "published_by_id": initial_author.pk if initial_author else None,
            },
        )
        ConfigurationDefinition.objects.filter(pk=definition.pk).update(current_version_id=version.pk)

    previous_hash = ""
    for event in AuditEvent.objects.order_by("created_at", "id").iterator():
        actor = User.objects.filter(pk=event.actor_id).values("id", "username", "email", "first_name", "last_name").first()
        actor_snapshot = {}
        if actor:
            actor_snapshot = {
                "id": actor["id"],
                "username": actor["username"],
                "email": actor["email"],
                "name": f"{actor['first_name']} {actor['last_name']}".strip(),
            }
        payload = {
            "id": str(event.id),
            "actor_id": event.actor_id,
            "actor_snapshot": actor_snapshot,
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
            actor_snapshot=actor_snapshot,
            previous_hash=previous_hash,
            event_hash=event_hash,
        )
        previous_hash = event_hash
    AuditHead.objects.update_or_create(singleton=1, defaults={"event_hash": previous_hash})


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


def drop_audit_trigger(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute("DROP TRIGGER IF EXISTS numa_audit_event_immutable ON core_auditevent;")
    schema_editor.execute("DROP FUNCTION IF EXISTS numa_prevent_audit_event_change();")


class Migration(migrations.Migration):
    dependencies = [("core", "0002_accessgroup_accessrole_audithead_backupjob_and_more")]

    operations = [
        migrations.RunPython(seed_enterprise_foundation, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="auditevent",
            name="event_hash",
            field=models.CharField(max_length=64, unique=True),
        ),
        migrations.RunPython(create_audit_trigger, drop_audit_trigger),
    ]
