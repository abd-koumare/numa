import uuid

import apps.core.models
import django.core.validators
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]

    operations = [
        migrations.CreateModel(
            name="OrganizationUnit",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.CharField(max_length=20, unique=True)),
                ("name", models.CharField(max_length=180)),
                ("active", models.BooleanField(default=True)),
                ("parent", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="children", to="core.organizationunit")),
            ],
            options={"ordering": ["code"]},
        ),
        migrations.CreateModel(
            name="NumberSequence",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("registry", models.CharField(choices=[("internal", "Interne"), ("external", "Externe")], max_length=12)),
                ("service_code", models.CharField(max_length=20)),
                ("year", models.PositiveSmallIntegerField()),
                ("next_value", models.PositiveIntegerField(default=1)),
            ],
        ),
        migrations.CreateModel(
            name="UserProfile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("keycloak_subject", models.CharField(max_length=255, unique=True)),
                ("title", models.CharField(blank=True, max_length=180)),
                ("roles", models.JSONField(default=list)),
                ("active", models.BooleanField(default=True)),
                ("last_seen_at", models.DateTimeField(blank=True, null=True)),
                ("organization_unit", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="core.organizationunit")),
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="numa_profile", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name="Correspondence",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("reference", models.CharField(blank=True, max_length=80, null=True, unique=True)),
                ("registry", models.CharField(choices=[("internal", "Interne"), ("external", "Externe")], max_length=12)),
                ("sender", models.CharField(max_length=255, validators=[django.core.validators.MinLengthValidator(2)])),
                ("origin_reference", models.CharField(blank=True, max_length=120)),
                ("received_at", models.DateField()),
                ("channel", models.CharField(choices=[("email", "Courriel"), ("paper", "Courrier papier"), ("portal", "Portail"), ("hand", "Remise en main propre")], default="email", max_length=12)),
                ("subject", models.CharField(max_length=500, validators=[django.core.validators.MinLengthValidator(3)])),
                ("priority", models.CharField(choices=[("low", "Basse"), ("normal", "Normale"), ("high", "Haute"), ("urgent", "Urgente")], default="normal", max_length=12)),
                ("confidentiality", models.CharField(choices=[("standard", "Standard"), ("restricted", "Restreint"), ("confidential", "Confidentiel")], default="standard", max_length=16)),
                ("status", models.CharField(choices=[("draft", "Brouillon"), ("to_process", "À traiter"), ("in_validation", "En validation"), ("validated", "Validé"), ("rejected", "Rejeté"), ("cancelled", "Annulé"), ("signed", "Signé")], default="draft", max_length=20)),
                ("due_at", models.DateField(blank=True, null=True)),
                ("summary", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("row_version", models.PositiveIntegerField(default=1)),
                ("created_by", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="created_correspondences", to=settings.AUTH_USER_MODEL)),
                ("direction", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="directed_correspondences", to="core.organizationunit")),
                ("responsible_service", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="responsible_correspondences", to="core.organizationunit")),
            ],
            options={"ordering": ["-received_at", "-created_at"]},
        ),
        migrations.CreateModel(
            name="DocumentVersion",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("version", models.PositiveIntegerField()),
                ("file", models.FileField(max_length=500, upload_to=apps.core.models.document_upload_path)),
                ("filename", models.CharField(max_length=255)),
                ("mime_type", models.CharField(max_length=160)),
                ("size", models.PositiveBigIntegerField()),
                ("sha256", models.CharField(max_length=64)),
                ("scan_status", models.CharField(choices=[("pending", "Analyse en attente"), ("clean", "Sain"), ("infected", "Infecté"), ("error", "Échec de l’analyse")], default="pending", max_length=12)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("correspondence", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="documents", to="core.correspondence")),
                ("created_by", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-version"]},
        ),
        migrations.CreateModel(
            name="WorkflowEvent",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("event", models.CharField(max_length=80)),
                ("from_status", models.CharField(blank=True, max_length=20)),
                ("to_status", models.CharField(max_length=20)),
                ("comment", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("actor", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to=settings.AUTH_USER_MODEL)),
                ("correspondence", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="workflow_events", to="core.correspondence")),
            ],
            options={"ordering": ["created_at"]},
        ),
        migrations.CreateModel(
            name="AuditEvent",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("action", models.CharField(max_length=120)),
                ("resource_type", models.CharField(max_length=80)),
                ("resource_id", models.CharField(max_length=80)),
                ("metadata", models.JSONField(default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("actor", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.AddConstraint(model_name="numbersequence", constraint=models.UniqueConstraint(fields=("registry", "service_code", "year"), name="unique_number_sequence")),
        migrations.AddConstraint(model_name="documentversion", constraint=models.UniqueConstraint(fields=("correspondence", "version"), name="unique_document_version")),
        migrations.AddIndex(model_name="correspondence", index=models.Index(fields=["registry", "status"], name="core_corres_registr_bf4326_idx")),
        migrations.AddIndex(model_name="correspondence", index=models.Index(fields=["reference"], name="core_corres_referen_bf6819_idx")),
        migrations.AddIndex(model_name="correspondence", index=models.Index(fields=["received_at"], name="core_corres_receive_ac1c41_idx")),
    ]
