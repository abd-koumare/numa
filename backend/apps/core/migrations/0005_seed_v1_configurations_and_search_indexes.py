from django.db import migrations


CONFIGURATIONS = [
    ("list", "courriers-externes", "Courriers externes", "Registre des courriers reçus et envoyés.", {
        "icon": "mail", "periodicity": "yearly", "registry": "external", "retention_years": 10,
        "columns": ["reference", "sender", "received_at", "subject", "direction", "responsible_service", "priority", "status"],
    }),
    ("list", "courriers-internes", "Courriers internes", "Notes, décisions et échanges internes.", {
        "icon": "note", "periodicity": "yearly", "registry": "internal", "retention_years": 10,
        "columns": ["reference", "sender", "received_at", "subject", "responsible_service", "priority", "status"],
    }),
    ("list", "demandes-achats", "Demandes d’achat", "Demandes avec validation financière.", {
        "icon": "form", "periodicity": "none", "registry": "custom", "retention_years": 10,
        "columns": ["reference", "subject", "amount", "requester", "status"],
    }),
    ("form", "correspondence-form", "Formulaire courrier", "Formulaire commun des registres interne et externe.", {
        "fields": [
            {"key": "sender", "type": "text", "label": "Expéditeur", "required": True},
            {"key": "origin_reference", "type": "text", "label": "Référence d’origine"},
            {"key": "received_at", "type": "date", "label": "Date de réception", "required": True},
            {"key": "subject", "type": "textarea", "label": "Objet", "required": True},
            {"key": "direction", "type": "organization-unit", "label": "Direction", "required": True},
            {"key": "responsible_service", "type": "organization-unit", "label": "Service responsable", "required": True},
            {"key": "priority", "type": "choice", "label": "Priorité", "required": True},
            {"key": "confidentiality", "type": "choice", "label": "Confidentialité", "required": True},
            {"key": "summary", "type": "textarea", "label": "Résumé"},
            {"key": "attachments", "type": "file", "label": "Pièces jointes"},
        ],
    }),
    ("view", "external-registry-default", "Vue du registre externe", "Colonnes, filtres et tri par défaut.", {
        "list": "courriers-externes", "columns": ["reference", "sender", "received_at", "subject", "direction", "priority", "status"],
        "filters": ["search", "status", "priority", "responsible_service", "received_at"], "ordering": ["-received_at"],
    }),
    ("view", "internal-registry-default", "Vue du registre interne", "Colonnes, filtres et tri par défaut.", {
        "list": "courriers-internes", "columns": ["reference", "sender", "received_at", "subject", "responsible_service", "priority", "status"],
        "filters": ["search", "status", "priority", "responsible_service", "received_at"], "ordering": ["-received_at"],
    }),
    ("rule", "amount-finance-validation", "Validation DAF au-delà du seuil", "Ajoute une validation financière.", {
        "scope": "demandes-achats", "condition": {"operator": "gt", "field": "amount", "value": 1000000},
        "actions": [{"type": "add_workflow_step", "workflow": "finance-validation"}],
    }),
    ("rule", "confidential-access", "Accès aux courriers confidentiels", "Restreint automatiquement l’accès.", {
        "scope": "correspondence", "condition": {"operator": "eq", "field": "confidentiality", "value": "confidential"},
        "actions": [{"type": "restrict_to_responsible_service"}],
    }),
    ("rule", "urgent-attachment", "Justificatif obligatoire", "Exige une pièce jointe pour les courriers urgents.", {
        "scope": "correspondence", "condition": {"operator": "eq", "field": "priority", "value": "urgent"},
        "actions": [{"type": "require_attachment"}],
    }),
    ("workflow", "correspondence-validation", "Validation des courriers", "Circuit standard de validation et signature.", {
        "steps": [
            {"key": "registration", "label": "Enregistrement", "kind": "preparation", "actor": "creator"},
            {"key": "validation", "label": "Validation", "kind": "validation", "actor": "role:validateur", "due_days": 2},
            {"key": "signature", "label": "Signature", "kind": "signature", "actor": "role:validateur", "optional": True},
            {"key": "archive", "label": "Archivage", "kind": "archive", "actor": "role:gestionnaire", "optional": True},
        ],
    }),
    ("page", "home-dashboard", "Tableau de bord", "Accueil personnalisable de NUMA.", {
        "blocks": [
            {"type": "heading", "text": "Tableau de bord"},
            {"type": "metric", "source": "dashboard.metrics"},
            {"type": "task-list", "source": "tasks.mine"},
            {"type": "recent-activity", "source": "correspondences.recent"},
        ],
    }),
    ("page", "help", "Aide", "Aide intégrée à l’application.", {
        "blocks": [{"type": "heading", "text": "Aide NUMA"}, {"type": "text", "text": "Consultez le guide administrateur ou contactez votre support interne."}],
    }),
    ("template", "correspondence-acknowledgement", "Accusé de réception", "Modèle d’accusé de réception.", {
        "format": "docx", "variables": ["reference", "sender", "received_at", "subject", "organization_name"],
        "body": "Votre courrier {{ reference }} relatif à {{ subject }} a bien été enregistré.",
    }),
    ("system", "retention-and-archives", "Conservation et archivage", "Politique de conservation par défaut.", {
        "correspondence_retention_years": 10, "audit_retention_years": 10, "document_versions_immutable": True,
    }),
]


def seed_configurations(apps, schema_editor):
    Definition = apps.get_model("core", "ConfigurationDefinition")
    Version = apps.get_model("core", "ConfigurationVersion")
    User = apps.get_model("auth", "User")
    author = User.objects.order_by("id").first()
    for kind, slug, name, description, data in CONFIGURATIONS:
        definition, _ = Definition.objects.get_or_create(
            kind=kind,
            slug=slug,
            defaults={"name": name, "description": description, "created_by_id": author.pk if author else None},
        )
        version, _ = Version.objects.get_or_create(
            definition=definition,
            version=1,
            defaults={
                "state": "published", "data": data, "created_by_id": author.pk if author else None,
                "published_by_id": author.pk if author else None,
            },
        )
        Definition.objects.filter(pk=definition.pk, current_version__isnull=True).update(current_version_id=version.pk)


def create_search_indexes(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    statements = [
        "CREATE EXTENSION IF NOT EXISTS pg_trgm",
        "CREATE INDEX IF NOT EXISTS numa_corr_reference_trgm ON core_correspondence USING gin (reference gin_trgm_ops)",
        "CREATE INDEX IF NOT EXISTS numa_corr_subject_trgm ON core_correspondence USING gin (subject gin_trgm_ops)",
        "CREATE INDEX IF NOT EXISTS numa_corr_sender_trgm ON core_correspondence USING gin (sender gin_trgm_ops)",
        "CREATE INDEX IF NOT EXISTS numa_corr_summary_trgm ON core_correspondence USING gin (summary gin_trgm_ops)",
        "CREATE INDEX IF NOT EXISTS numa_doc_text_trgm ON core_documentversion USING gin (extracted_text gin_trgm_ops)",
    ]
    for statement in statements:
        schema_editor.execute(statement)


def drop_search_indexes(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    for name in ["numa_corr_reference_trgm", "numa_corr_subject_trgm", "numa_corr_sender_trgm", "numa_corr_summary_trgm", "numa_doc_text_trgm"]:
        schema_editor.execute(f"DROP INDEX IF EXISTS {name}")


class Migration(migrations.Migration):
    dependencies = [("core", "0004_organizationsettings_row_version_and_more")]

    operations = [
        migrations.RunPython(seed_configurations, migrations.RunPython.noop),
        migrations.RunPython(create_search_indexes, drop_search_indexes),
    ]
