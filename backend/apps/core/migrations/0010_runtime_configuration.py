import hashlib
import json
import uuid

from django.db import migrations, models
import django.db.models.deletion
from django.utils import timezone


DEFAULT_BINDINGS = {
    "courriers-externes": {
        "form": "correspondence-form",
        "numbering": "correspondence-numbering",
        "workflow": "correspondence-validation",
        "rules": ["confidential-access", "urgent-attachment"],
        "signature_policy": "default-signature-policy",
    },
    "courriers-internes": {
        "form": "correspondence-form",
        "numbering": "correspondence-numbering",
        "workflow": "correspondence-validation",
        "rules": ["confidential-access", "urgent-attachment"],
        "signature_policy": "default-signature-policy",
    },
    "demandes-achats": {
        "form": "demandes-achats-form",
        "workflow": "finance-validation",
        "rules": ["amount-finance-validation"],
    },
}


def _hash(kind, schema_version, data):
    payload = json.dumps(
        {"kind": kind, "schema_version": schema_version, "data": data or {}},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def backfill_runtime_configuration(apps, schema_editor):
    Definition = apps.get_model("core", "ConfigurationDefinition")
    Version = apps.get_model("core", "ConfigurationVersion")
    Bundle = apps.get_model("core", "RuntimeConfigurationBundle")
    BundleRule = apps.get_model("core", "RuntimeConfigurationRule")
    Correspondence = apps.get_model("core", "Correspondence")
    GenericItem = apps.get_model("core", "GenericListItem")
    WorkflowInstance = apps.get_model("core", "WorkflowInstance")
    SignatureProof = apps.get_model("core", "SignatureProof")

    for version in Version.objects.select_related("definition").iterator():
        dependencies = []
        bindings = (version.data or {}).get("bindings", {}) if version.definition.kind == "list" else {}
        if isinstance(bindings, dict):
            for role, kind in {
                "form": "form",
                "view": "view",
                "numbering": "numbering",
                "workflow": "workflow",
                "signature_policy": "signature_policy",
            }.items():
                if bindings.get(role):
                    dependencies.append({"role": role, "kind": kind, "slug": bindings[role], "position": 0})
            for position, slug in enumerate(bindings.get("rules", []) if isinstance(bindings.get("rules", []), list) else []):
                dependencies.append({"role": "rule", "kind": "rule", "slug": slug, "position": position})
        Version.objects.filter(pk=version.pk).update(
            compiled_data=version.data or {},
            dependencies=dependencies,
            content_hash=_hash(version.definition.kind, version.schema_version, version.data or {}),
        )

    def published(kind, slug):
        definition = Definition.objects.filter(
            kind=kind,
            slug=slug,
            active=True,
            current_version__state="published",
        ).first()
        return definition.current_version_id if definition else None

    def bundle_for(list_version_id, definition_slug):
        if not list_version_id:
            return None
        bindings = DEFAULT_BINDINGS.get(definition_slug, {})
        form_id = published("form", bindings["form"]) if bindings.get("form") else None
        numbering_id = published("numbering", bindings["numbering"]) if bindings.get("numbering") else None
        workflow_id = published("workflow", bindings["workflow"]) if bindings.get("workflow") else None
        signature_id = published("signature_policy", bindings["signature_policy"]) if bindings.get("signature_policy") else None
        rule_ids = [published("rule", slug) for slug in bindings.get("rules", [])]
        rule_ids = [value for value in rule_ids if value]
        values = {
            "list": str(list_version_id),
            "form": str(form_id) if form_id else None,
            "numbering": str(numbering_id) if numbering_id else None,
            "workflow": str(workflow_id) if workflow_id else None,
            "signature_policy": str(signature_id) if signature_id else None,
            "rules": [str(value) for value in rule_ids],
        }
        digest = hashlib.sha256(json.dumps(values, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
        bundle, created = Bundle.objects.get_or_create(
            content_hash=digest,
            defaults={
                "list_version_id": list_version_id,
                "form_version_id": form_id,
                "numbering_version_id": numbering_id,
                "workflow_version_id": workflow_id,
                "signature_policy_version_id": signature_id,
            },
        )
        if created:
            BundleRule.objects.bulk_create(
                [
                    BundleRule(bundle_id=bundle.pk, version_id=version_id, position=position)
                    for position, version_id in enumerate(rule_ids)
                ]
            )
        return bundle

    for item in Correspondence.objects.select_related("list_instance__definition").iterator():
        list_version_id = item.configuration_version_id
        if not list_version_id and item.list_instance_id:
            list_version_id = item.list_instance.configuration_version_id
        slug = item.list_instance.definition.slug if item.list_instance_id else (
            "courriers-internes" if item.registry == "internal" else "courriers-externes"
        )
        bundle = bundle_for(list_version_id, slug)
        Correspondence.objects.filter(pk=item.pk).update(
            configuration_version_id=list_version_id,
            configuration_bundle_id=bundle.pk if bundle else None,
        )

    for item in GenericItem.objects.select_related("instance__definition").iterator():
        bundle = bundle_for(item.instance.configuration_version_id, item.instance.definition.slug)
        GenericItem.objects.filter(pk=item.pk).update(configuration_bundle_id=bundle.pk if bundle else None)

    for workflow in WorkflowInstance.objects.select_related("correspondence__configuration_bundle").iterator():
        bundle = workflow.correspondence.configuration_bundle
        if bundle and bundle.workflow_version_id and not workflow.definition_version_id:
            WorkflowInstance.objects.filter(pk=workflow.pk).update(definition_version_id=bundle.workflow_version_id)

    for proof in SignatureProof.objects.select_related("correspondence__configuration_bundle").iterator():
        bundle = proof.correspondence.configuration_bundle
        if bundle and bundle.signature_policy_version_id:
            SignatureProof.objects.filter(pk=proof.pk).update(policy_version_id=bundle.signature_policy_version_id)


def normalize_open_list_instances(apps, schema_editor):
    ListInstance = apps.get_model("core", "ListInstance")
    open_statuses = ["active", "reopened"]
    definition_ids = (
        ListInstance.objects.filter(status__in=open_statuses)
        .values_list("definition_id", flat=True)
        .distinct()
    )
    now = timezone.now()
    for definition_id in definition_ids:
        instance_ids = list(
            ListInstance.objects.filter(
                definition_id=definition_id,
                status__in=open_statuses,
            )
            .order_by("-updated_at", "-created_at", "-id")
            .values_list("id", flat=True)
        )
        if len(instance_ids) > 1:
            ListInstance.objects.filter(id__in=instance_ids[1:]).update(
                status="closed",
                active=False,
                closed_at=now,
            )


class Migration(migrations.Migration):
    # The data backfill updates foreign-key rows before Django replaces a
    # constraint/index. PostgreSQL must commit the resulting trigger events
    # before that DDL can run, otherwise it raises "pending trigger events".
    atomic = False

    dependencies = [("core", "0009_listinstance_reopened")]

    operations = [
        migrations.AddField(
            model_name="configurationversion",
            name="schema_version",
            field=models.PositiveSmallIntegerField(default=1),
        ),
        migrations.AddField(
            model_name="configurationversion",
            name="compiled_data",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="configurationversion",
            name="dependencies",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="configurationversion",
            name="content_hash",
            field=models.CharField(blank=True, db_index=True, max_length=64),
        ),
        migrations.CreateModel(
            name="RuntimeConfigurationBundle",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("content_hash", models.CharField(max_length=64, unique=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("form_version", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="runtime_form_bundles", to="core.configurationversion")),
                ("list_version", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="runtime_list_bundles", to="core.configurationversion")),
                ("numbering_version", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="runtime_numbering_bundles", to="core.configurationversion")),
                ("signature_policy_version", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="runtime_signature_policy_bundles", to="core.configurationversion")),
                ("workflow_version", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="runtime_workflow_bundles", to="core.configurationversion")),
            ],
            options={"ordering": ["created_at"]},
        ),
        migrations.CreateModel(
            name="RuntimeConfigurationRule",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("position", models.PositiveSmallIntegerField()),
                ("bundle", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="ordered_rules", to="core.runtimeconfigurationbundle")),
                ("version", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="runtime_rule_entries", to="core.configurationversion")),
            ],
            options={
                "ordering": ["position"],
                "constraints": [
                    models.UniqueConstraint(fields=("bundle", "position"), name="unique_runtime_rule_position"),
                    models.UniqueConstraint(fields=("bundle", "version"), name="unique_runtime_rule_version"),
                ],
            },
        ),
        migrations.AddField(
            model_name="runtimeconfigurationbundle",
            name="rule_versions",
            field=models.ManyToManyField(related_name="runtime_rule_bundles", through="core.RuntimeConfigurationRule", to="core.configurationversion"),
        ),
        migrations.AddField(
            model_name="correspondence",
            name="configuration_bundle",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="correspondences", to="core.runtimeconfigurationbundle"),
        ),
        migrations.AddField(
            model_name="genericlistitem",
            name="configuration_bundle",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="generic_items", to="core.runtimeconfigurationbundle"),
        ),
        migrations.AddField(
            model_name="signatureproof",
            name="policy_version",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="signature_proofs", to="core.configurationversion"),
        ),
        migrations.AddField(
            model_name="signatureproof",
            name="provider",
            field=models.CharField(blank=True, max_length=80),
        ),
        migrations.RunPython(backfill_runtime_configuration, migrations.RunPython.noop),
        migrations.RunPython(normalize_open_list_instances, migrations.RunPython.noop),
        migrations.RemoveConstraint(
            model_name="listinstance",
            name="unique_active_list_instance",
        ),
        migrations.AddConstraint(
            model_name="listinstance",
            constraint=models.UniqueConstraint(
                fields=("definition",),
                condition=models.Q(status__in=["active", "reopened"]),
                name="unique_active_list_instance",
            ),
        ),
    ]
