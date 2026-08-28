import hashlib
import json
import uuid

from django.contrib.auth.models import User
from django.core.validators import MinLengthValidator
from django.db import models, transaction
from django.db.models import Q
from django.utils import timezone


GRANT_CAPABILITY_ALIASES = {
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


def normalize_grant_capabilities(values):
    """Return stable, fully-qualified capabilities for storage and comparisons."""
    return sorted({GRANT_CAPABILITY_ALIASES.get(str(value).strip(), str(value).strip()) for value in values or [] if str(value).strip()})


class OrganizationUnit(models.Model):
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=180)
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT, related_name="children")
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} — {self.name}"


class OrganizationSettings(models.Model):
    """Singleton containing the public identity and organization-level settings."""

    singleton = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    organization_name = models.CharField(max_length=180, default="Organisation")
    application_name = models.CharField(max_length=80, default="NUMA")
    primary_color = models.CharField(max_length=9, default="#14532d")
    accent_color = models.CharField(max_length=9, default="#ca8a04")
    logo_data_url = models.TextField(blank=True)
    favicon_data_url = models.TextField(blank=True)
    footer_text = models.CharField(max_length=255, blank=True)
    default_home = models.CharField(max_length=40, default="dashboard")
    locale = models.CharField(max_length=12, default="fr-FR")
    timezone = models.CharField(max_length=64, default="UTC")
    configured = models.BooleanField(default=False)
    settings = models.JSONField(default=dict, blank=True)
    row_version = models.PositiveIntegerField(default=1)
    updated_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.PROTECT)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        self.singleton = 1
        return super().save(*args, **kwargs)


class UserPreference(models.Model):
    class Theme(models.TextChoices):
        SYSTEM = "system", "Système"
        LIGHT = "light", "Clair"
        DARK = "dark", "Sombre"

    user = models.OneToOneField(User, primary_key=True, on_delete=models.CASCADE, related_name="numa_preferences")
    locale = models.CharField(max_length=12, default="fr-FR")
    timezone = models.CharField(max_length=64, default="UTC")
    default_home = models.CharField(max_length=40, default="dashboard")
    theme = models.CharField(max_length=12, choices=Theme.choices, default=Theme.SYSTEM)
    page_size = models.PositiveSmallIntegerField(default=25)
    compact_mode = models.BooleanField(default=False)
    web_notifications = models.BooleanField(default=True)
    email_notifications = models.BooleanField(default=True)
    settings = models.JSONField(default=dict, blank=True)
    row_version = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)


class SystemSetting(models.Model):
    class Section(models.TextChoices):
        GENERAL = "general", "Général"
        SECURITY = "security", "Sécurité"
        FILES = "files", "Fichiers"
        NOTIFICATIONS = "notifications", "Notifications"
        INTERNATIONALIZATION = "internationalization", "Internationalisation"
        SEARCH = "search", "Recherche et OCR"
        RETENTION = "retention", "Conservation"
        BACKUPS = "backups", "Sauvegardes"

    section = models.SlugField(primary_key=True, max_length=40, choices=Section.choices)
    values = models.JSONField(default=dict, blank=True)
    row_version = models.PositiveIntegerField(default=1)
    updated_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.PROTECT, related_name="updated_system_settings")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["section"]


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="numa_profile")
    keycloak_subject = models.CharField(max_length=255, unique=True)
    organization_unit = models.ForeignKey(OrganizationUnit, null=True, blank=True, on_delete=models.SET_NULL)
    title = models.CharField(max_length=180, blank=True)
    # Kept during the V1 migration window for backward compatibility with old tokens.
    roles = models.JSONField(default=list)
    external_groups = models.JSONField(default=list, blank=True)
    active = models.BooleanField(default=True)
    access_requested_at = models.DateTimeField(null=True, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.user.get_full_name() or self.user.username


class AccessRole(models.Model):
    slug = models.SlugField(primary_key=True, max_length=80)
    label = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    capabilities = models.JSONField(default=list, blank=True)
    protected = models.BooleanField(default=False)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["label"]

    def __str__(self):
        return self.label


class AccessGroup(models.Model):
    class Source(models.TextChoices):
        LOCAL = "local", "NUMA"
        DIRECTORY = "directory", "Annuaire"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    source = models.CharField(max_length=16, choices=Source.choices, default=Source.LOCAL)
    external_id = models.CharField(max_length=255, blank=True)
    organization_unit = models.ForeignKey(OrganizationUnit, null=True, blank=True, on_delete=models.SET_NULL)
    roles = models.ManyToManyField(AccessRole, blank=True, related_name="groups")
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["source", "external_id"],
                condition=~Q(external_id=""),
                name="unique_external_access_group",
            ),
        ]

    def __str__(self):
        return self.name


class UserRoleAssignment(models.Model):
    class Source(models.TextChoices):
        MANUAL = "manual", "Manuel"
        KEYCLOAK = "keycloak", "Keycloak"
        MIGRATION = "migration", "Migration"

    profile = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name="role_assignments")
    role = models.ForeignKey(AccessRole, on_delete=models.PROTECT, related_name="user_assignments")
    source = models.CharField(max_length=16, choices=Source.choices, default=Source.MANUAL)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.PROTECT, related_name="created_role_assignments")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["profile", "role", "source"], name="unique_user_role_source"),
        ]


class GroupMembership(models.Model):
    class Source(models.TextChoices):
        MANUAL = "manual", "Manuel"
        DIRECTORY = "directory", "Annuaire"

    profile = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name="group_memberships")
    group = models.ForeignKey(AccessGroup, on_delete=models.CASCADE, related_name="memberships")
    source = models.CharField(max_length=16, choices=Source.choices, default=Source.MANUAL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["profile", "group"], name="unique_group_membership")]


class ConfigurationDefinition(models.Model):
    class Kind(models.TextChoices):
        LIST = "list", "Liste"
        FORM = "form", "Formulaire"
        VIEW = "view", "Vue"
        NUMBERING = "numbering", "Numérotation"
        RULE = "rule", "Règle"
        WORKFLOW = "workflow", "Workflow"
        PAGE = "page", "Page"
        TEMPLATE = "template", "Modèle"
        NAVIGATION = "navigation", "Navigation"
        BRANDING = "branding", "Identité visuelle"
        SYSTEM = "system", "Système"
        SIGNATURE_POLICY = "signature_policy", "Politique de signature"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=32, choices=Kind.choices)
    slug = models.SlugField(max_length=120)
    name = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    active = models.BooleanField(default=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.PROTECT, related_name="created_configurations")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    current_version = models.ForeignKey(
        "ConfigurationVersion",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="current_for_definitions",
    )

    class Meta:
        ordering = ["kind", "name"]
        constraints = [models.UniqueConstraint(fields=["kind", "slug"], name="unique_configuration_slug")]

    def __str__(self):
        return f"{self.get_kind_display()} — {self.name}"


class ConfigurationVersion(models.Model):
    class State(models.TextChoices):
        DRAFT = "draft", "Brouillon"
        PUBLISHED = "published", "Publié"
        ARCHIVED = "archived", "Archivé"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    definition = models.ForeignKey(ConfigurationDefinition, on_delete=models.CASCADE, related_name="versions")
    version = models.PositiveIntegerField()
    state = models.CharField(max_length=16, choices=State.choices, default=State.DRAFT)
    data = models.JSONField(default=dict)
    schema_version = models.PositiveSmallIntegerField(default=1)
    compiled_data = models.JSONField(default=dict, blank=True)
    dependencies = models.JSONField(default=list, blank=True)
    content_hash = models.CharField(max_length=64, blank=True, db_index=True)
    validation_errors = models.JSONField(default=list, blank=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.PROTECT, related_name="created_configuration_versions")
    published_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.PROTECT, related_name="published_configuration_versions")
    created_at = models.DateTimeField(auto_now_add=True)
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-version"]
        constraints = [
            models.UniqueConstraint(fields=["definition", "version"], name="unique_configuration_version"),
        ]


class RuntimeConfigurationBundle(models.Model):
    """Immutable set of behavior-affecting configuration versions pinned to a record."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    list_version = models.ForeignKey(
        ConfigurationVersion,
        on_delete=models.PROTECT,
        related_name="runtime_list_bundles",
    )
    form_version = models.ForeignKey(
        ConfigurationVersion,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="runtime_form_bundles",
    )
    numbering_version = models.ForeignKey(
        ConfigurationVersion,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="runtime_numbering_bundles",
    )
    workflow_version = models.ForeignKey(
        ConfigurationVersion,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="runtime_workflow_bundles",
    )
    signature_policy_version = models.ForeignKey(
        ConfigurationVersion,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="runtime_signature_policy_bundles",
    )
    rule_versions = models.ManyToManyField(
        ConfigurationVersion,
        through="RuntimeConfigurationRule",
        related_name="runtime_rule_bundles",
    )
    content_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]


class RuntimeConfigurationRule(models.Model):
    bundle = models.ForeignKey(RuntimeConfigurationBundle, on_delete=models.CASCADE, related_name="ordered_rules")
    version = models.ForeignKey(ConfigurationVersion, on_delete=models.PROTECT, related_name="runtime_rule_entries")
    position = models.PositiveSmallIntegerField()

    class Meta:
        ordering = ["position"]
        constraints = [
            models.UniqueConstraint(fields=["bundle", "position"], name="unique_runtime_rule_position"),
            models.UniqueConstraint(fields=["bundle", "version"], name="unique_runtime_rule_version"),
        ]


class ListInstance(models.Model):
    class Status(models.TextChoices):
        PLANNED = "planned", "Planifiée"
        ACTIVE = "active", "Active"
        REOPENED = "reopened", "Rouverte"
        CLOSED = "closed", "Clôturée"
        ARCHIVED = "archived", "Archivée"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    definition = models.ForeignKey(ConfigurationDefinition, on_delete=models.PROTECT, related_name="list_instances")
    period_key = models.CharField(max_length=80, blank=True)
    label = models.CharField(max_length=180)
    active = models.BooleanField(default=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    configuration_version = models.ForeignKey(ConfigurationVersion, on_delete=models.PROTECT)
    scheduled_open_at = models.DateTimeField(null=True, blank=True)
    opened_at = models.DateTimeField(null=True, blank=True)
    scheduled_close_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    reopened_at = models.DateTimeField(null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    row_version = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.PROTECT, related_name="created_list_instances")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-period_key", "label"]
        constraints = [
            models.UniqueConstraint(fields=["definition", "period_key"], name="unique_list_instance_period"),
            models.UniqueConstraint(
                fields=["definition"],
                condition=Q(status__in=["active", "reopened"]),
                name="unique_active_list_instance",
            ),
        ]

    def save(self, *args, **kwargs):
        self.active = self.status in {self.Status.ACTIVE, self.Status.REOPENED}
        update_fields = kwargs.get("update_fields")
        if update_fields is not None and "status" in update_fields:
            kwargs["update_fields"] = set(update_fields) | {"active"}
        return super().save(*args, **kwargs)


class GenericListItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    instance = models.ForeignKey(ListInstance, on_delete=models.CASCADE, related_name="items")
    label = models.CharField(max_length=500)
    search_text = models.TextField(blank=True)
    data = models.JSONField(default=dict)
    status = models.CharField(max_length=40, default="active")
    configuration_bundle = models.ForeignKey(
        RuntimeConfigurationBundle,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="generic_items",
    )
    row_version = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="created_list_items")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["instance", "status"])]


class Correspondence(models.Model):
    class Registry(models.TextChoices):
        INTERNAL = "internal", "Interne"
        EXTERNAL = "external", "Externe"

    class Status(models.TextChoices):
        DRAFT = "draft", "Brouillon"
        REGISTERED = "registered", "Enregistré"
        TO_PROCESS = "to_process", "À traiter"
        IN_VALIDATION = "in_validation", "En validation"
        VALIDATED = "validated", "Validé"
        REJECTED = "rejected", "Rejeté"
        CANCELLED = "cancelled", "Annulé"
        SIGNED = "signed", "Signé"
        ARCHIVED = "archived", "Archivé"

    class Priority(models.TextChoices):
        LOW = "low", "Basse"
        NORMAL = "normal", "Normale"
        HIGH = "high", "Haute"
        URGENT = "urgent", "Urgente"

    class Confidentiality(models.TextChoices):
        STANDARD = "standard", "Standard"
        RESTRICTED = "restricted", "Restreint"
        CONFIDENTIAL = "confidential", "Confidentiel"

    class Channel(models.TextChoices):
        EMAIL = "email", "Courriel"
        PAPER = "paper", "Courrier papier"
        PORTAL = "portal", "Portail"
        HAND = "hand", "Remise en main propre"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference = models.CharField(max_length=80, unique=True, null=True, blank=True)
    registry = models.CharField(max_length=12, choices=Registry.choices)
    sender = models.CharField(max_length=255, validators=[MinLengthValidator(2)])
    origin_reference = models.CharField(max_length=120, blank=True)
    received_at = models.DateField()
    channel = models.CharField(max_length=12, choices=Channel.choices, default=Channel.EMAIL)
    subject = models.CharField(max_length=500, validators=[MinLengthValidator(3)])
    direction = models.ForeignKey(OrganizationUnit, on_delete=models.PROTECT, related_name="directed_correspondences")
    responsible_service = models.ForeignKey(OrganizationUnit, on_delete=models.PROTECT, related_name="responsible_correspondences")
    priority = models.CharField(max_length=12, choices=Priority.choices, default=Priority.NORMAL)
    confidentiality = models.CharField(max_length=16, choices=Confidentiality.choices, default=Confidentiality.STANDARD)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    due_at = models.DateField(null=True, blank=True)
    summary = models.TextField(blank=True)
    custom_data = models.JSONField(default=dict, blank=True)
    configuration_version = models.ForeignKey(ConfigurationVersion, null=True, blank=True, on_delete=models.PROTECT)
    configuration_bundle = models.ForeignKey(
        RuntimeConfigurationBundle,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="correspondences",
    )
    list_instance = models.ForeignKey(ListInstance, null=True, blank=True, on_delete=models.PROTECT, related_name="correspondences")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="created_correspondences")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    reopened_at = models.DateTimeField(null=True, blank=True)
    row_version = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["-received_at", "-created_at"]
        indexes = [
            models.Index(fields=["registry", "status"]),
            models.Index(fields=["reference"]),
            models.Index(fields=["received_at"]),
            models.Index(fields=["responsible_service", "status"]),
        ]


class CorrespondenceAccessGrant(models.Model):
    class Source(models.TextChoices):
        OWNER = "owner", "Créateur"
        SERVICE = "service", "Service destinataire"
        WORKFLOW = "workflow", "Workflow"
        MANUAL = "manual", "Manuel"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    correspondence = models.ForeignKey(Correspondence, on_delete=models.CASCADE, related_name="access_grants")
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.CASCADE, related_name="correspondence_grants")
    group = models.ForeignKey(AccessGroup, null=True, blank=True, on_delete=models.CASCADE, related_name="correspondence_grants")
    capabilities = models.JSONField(default=list)
    source = models.CharField(max_length=16, choices=Source.choices, default=Source.MANUAL)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.PROTECT, related_name="created_correspondence_grants")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["correspondence", "user"]),
            models.Index(fields=["correspondence", "group"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=(Q(user__isnull=False, group__isnull=True) | Q(user__isnull=True, group__isnull=False)),
                name="correspondence_grant_one_principal",
            ),
            models.UniqueConstraint(
                fields=["correspondence", "user", "source"],
                condition=Q(user__isnull=False),
                name="unique_correspondence_user_grant",
            ),
            models.UniqueConstraint(
                fields=["correspondence", "group", "source"],
                condition=Q(group__isnull=False),
                name="unique_correspondence_group_grant",
            ),
        ]

    def save(self, *args, **kwargs):
        self.capabilities = normalize_grant_capabilities(self.capabilities)
        with transaction.atomic():
            result = super().save(*args, **kwargs)
            self.permission_rows.exclude(capability__in=self.capabilities).delete()
            existing = set(self.permission_rows.values_list("capability", flat=True))
            CorrespondenceAccessGrantCapability.objects.bulk_create(
                [CorrespondenceAccessGrantCapability(grant=self, capability=value) for value in self.capabilities if value not in existing],
                ignore_conflicts=True,
            )
            return result


class CorrespondenceAccessGrantCapability(models.Model):
    grant = models.ForeignKey(CorrespondenceAccessGrant, on_delete=models.CASCADE, related_name="permission_rows")
    capability = models.CharField(max_length=80)

    class Meta:
        ordering = ["capability"]
        constraints = [
            models.UniqueConstraint(fields=["grant", "capability"], name="unique_correspondence_grant_capability"),
        ]
        indexes = [models.Index(fields=["capability", "grant"])]


class Document(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    correspondence = models.ForeignKey(Correspondence, on_delete=models.CASCADE, related_name="files")
    title = models.CharField(max_length=255)
    kind = models.CharField(max_length=60, default="attachment")
    active_version_number = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="created_documents")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]


def document_upload_path(instance, filename):
    document_id = instance.document_id or instance.id
    return f"correspondences/{instance.correspondence_id}/{document_id}/{instance.id}/{filename}"


def document_preview_path(instance, filename):
    return f"correspondences/{instance.correspondence_id}/{instance.document_id}/previews/{instance.id}/{filename}"


class DocumentVersion(models.Model):
    class ScanStatus(models.TextChoices):
        PENDING = "pending", "Analyse en attente"
        CLEAN = "clean", "Sain"
        INFECTED = "infected", "Infecté"
        ERROR = "error", "Échec de l’analyse"

    class ExtractionStatus(models.TextChoices):
        PENDING = "pending", "Extraction en attente"
        COMPLETE = "complete", "Texte indexé"
        UNSUPPORTED = "unsupported", "Format non pris en charge"
        ERROR = "error", "Échec de l’extraction"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(Document, null=True, blank=True, on_delete=models.CASCADE, related_name="versions")
    # Denormalized for permission-safe lookups and backward-compatible URLs.
    correspondence = models.ForeignKey(Correspondence, on_delete=models.CASCADE, related_name="documents")
    version = models.PositiveIntegerField()
    file = models.FileField(upload_to=document_upload_path, max_length=500)
    preview_file = models.FileField(upload_to=document_preview_path, max_length=500, null=True, blank=True)
    filename = models.CharField(max_length=255)
    mime_type = models.CharField(max_length=160)
    detected_mime_type = models.CharField(max_length=160, blank=True)
    size = models.PositiveBigIntegerField()
    sha256 = models.CharField(max_length=64)
    scan_status = models.CharField(max_length=12, choices=ScanStatus.choices, default=ScanStatus.PENDING)
    extraction_status = models.CharField(max_length=16, choices=ExtractionStatus.choices, default=ExtractionStatus.PENDING)
    extracted_text = models.TextField(blank=True)
    extraction_error = models.TextField(blank=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-version"]
        constraints = [
            models.UniqueConstraint(
                fields=["document", "version"],
                condition=Q(document__isnull=False),
                name="unique_logical_document_version",
            ),
            models.UniqueConstraint(
                fields=["correspondence", "version"],
                condition=Q(document__isnull=True),
                name="unique_legacy_document_version",
            ),
        ]
        indexes = [
            models.Index(fields=["correspondence", "scan_status"]),
            models.Index(fields=["sha256"]),
        ]


class NumberSequence(models.Model):
    registry = models.CharField(max_length=12, choices=Correspondence.Registry.choices)
    service_code = models.CharField(max_length=20)
    year = models.PositiveSmallIntegerField()
    scope_key = models.CharField(max_length=120, default="default")
    next_value = models.PositiveIntegerField(default=1)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["registry", "service_code", "year", "scope_key"],
                name="unique_number_sequence_scope",
            ),
        ]


class WorkflowInstance(models.Model):
    class Status(models.TextChoices):
        RUNNING = "running", "En cours"
        COMPLETED = "completed", "Terminé"
        REJECTED = "rejected", "Rejeté"
        CANCELLED = "cancelled", "Annulé"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    correspondence = models.OneToOneField(Correspondence, on_delete=models.CASCADE, related_name="workflow")
    definition_version = models.ForeignKey(ConfigurationVersion, null=True, blank=True, on_delete=models.PROTECT)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.RUNNING)
    current_step = models.CharField(max_length=120, blank=True)
    context = models.JSONField(default=dict, blank=True)
    started_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="started_workflows")
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)


class WorkflowTask(models.Model):
    class Kind(models.TextChoices):
        PROCESSING = "processing", "Traitement"
        VALIDATION = "validation", "Validation"
        SIGNATURE = "signature", "Signature"

    class Status(models.TextChoices):
        TODO = "todo", "À faire"
        IN_PROGRESS = "in_progress", "En cours"
        COMPLETED = "completed", "Terminée"
        REJECTED = "rejected", "Rejetée"
        CANCELLED = "cancelled", "Annulée"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workflow = models.ForeignKey(WorkflowInstance, on_delete=models.CASCADE, related_name="tasks")
    step_key = models.CharField(max_length=120)
    label = models.CharField(max_length=180)
    kind = models.CharField(max_length=16, choices=Kind.choices)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.TODO)
    assignee = models.ForeignKey(User, null=True, blank=True, on_delete=models.PROTECT, related_name="workflow_tasks")
    assignee_group = models.ForeignKey(AccessGroup, null=True, blank=True, on_delete=models.PROTECT, related_name="workflow_tasks")
    due_at = models.DateTimeField(null=True, blank=True)
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.PROTECT, related_name="completed_workflow_tasks")

    class Meta:
        ordering = ["status", "due_at", "created_at"]
        indexes = [models.Index(fields=["assignee", "status"]), models.Index(fields=["assignee_group", "status"])]
        constraints = [models.UniqueConstraint(fields=["workflow", "step_key"], name="unique_workflow_step")]


class WorkflowEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    correspondence = models.ForeignKey(Correspondence, on_delete=models.CASCADE, related_name="workflow_events")
    workflow = models.ForeignKey(WorkflowInstance, null=True, blank=True, on_delete=models.CASCADE, related_name="events")
    task = models.ForeignKey(WorkflowTask, null=True, blank=True, on_delete=models.SET_NULL, related_name="events")
    event = models.CharField(max_length=80)
    from_status = models.CharField(max_length=20, blank=True)
    to_status = models.CharField(max_length=20)
    actor = models.ForeignKey(User, on_delete=models.PROTECT)
    comment = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]


class SignatureProof(models.Model):
    class Level(models.TextChoices):
        INTERNAL = "electronic-validation", "Validation électronique interne"
        GRAPHIC = "graphic", "Signature graphique"
        DIGITAL = "digital", "Signature numérique qualifiée"

    class Status(models.TextChoices):
        REQUESTED = "requested", "Demandée"
        VERIFIED = "verified", "Vérifiée"
        FAILED = "failed", "Échec"
        CANCELLED = "cancelled", "Annulée"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    correspondence = models.ForeignKey(Correspondence, on_delete=models.CASCADE, related_name="signature_proofs")
    document_version = models.ForeignKey(DocumentVersion, on_delete=models.PROTECT, related_name="signature_proofs")
    level = models.CharField(max_length=32, choices=Level.choices)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.REQUESTED)
    signer = models.ForeignKey(User, on_delete=models.PROTECT, related_name="signature_proofs")
    signer_role = models.CharField(max_length=120, blank=True)
    graphic_mark = models.TextField(blank=True)
    document_hash = models.CharField(max_length=64)
    evidence = models.JSONField(default=dict)
    policy_version = models.ForeignKey(
        ConfigurationVersion,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="signature_proofs",
    )
    provider = models.CharField(max_length=80, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    signed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class Notification(models.Model):
    class Kind(models.TextChoices):
        VALIDATION = "validation", "Validation"
        SIGNATURE = "signature", "Signature"
        SYSTEM = "system", "Système"
        DEADLINE = "deadline", "Échéance"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name="numa_notifications")
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.SYSTEM)
    title = models.CharField(max_length=180)
    detail = models.TextField(blank=True)
    path = models.CharField(max_length=500, blank=True)
    data = models.JSONField(default=dict, blank=True)
    email_requested = models.BooleanField(default=False)
    email_sent_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["recipient", "read_at", "created_at"])]


class SavedSearch(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="saved_searches")
    name = models.CharField(max_length=180)
    query = models.JSONField(default=dict)
    shared = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["owner", "name"], name="unique_saved_search_name")]


class TransferJob(models.Model):
    class Kind(models.TextChoices):
        IMPORT = "import", "Import"
        EXPORT = "export", "Export"

    class Status(models.TextChoices):
        PENDING = "pending", "En attente"
        RUNNING = "running", "En cours"
        COMPLETE = "complete", "Terminé"
        FAILED = "failed", "Échec"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=12, choices=Kind.choices)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    resource_type = models.CharField(max_length=80)
    source_file = models.FileField(upload_to="transfers/imports/", max_length=500, null=True, blank=True)
    result_file = models.FileField(upload_to="transfers/exports/", max_length=500, null=True, blank=True)
    options = models.JSONField(default=dict, blank=True)
    result = models.JSONField(default=dict, blank=True)
    error = models.TextField(blank=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="transfer_jobs")
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class BackupJob(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "En attente"
        RUNNING = "running", "En cours"
        COMPLETE = "complete", "Terminée"
        FAILED = "failed", "Échec"

    class Destination(models.TextChoices):
        LOCAL = "local", "Stockage local"
        S3 = "s3", "Stockage S3"
        BOTH = "both", "Local et S3"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    destination = models.CharField(max_length=16, choices=Destination.choices, default=Destination.BOTH)
    encrypted = models.BooleanField(default=True)
    location = models.CharField(max_length=500, blank=True)
    checksum = models.CharField(max_length=64, blank=True)
    size = models.PositiveBigIntegerField(default=0)
    error = models.TextField(blank=True)
    requested_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="backup_jobs")
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class WebhookEndpoint(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=180)
    url = models.URLField(max_length=500)
    events = models.JSONField(default=list)
    secret_encrypted = models.TextField(blank=True)
    active = models.BooleanField(default=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="created_webhooks")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class IdentityProviderConfiguration(models.Model):
    class Provider(models.TextChoices):
        OIDC = "oidc", "OpenID Connect"
        SAML = "saml", "SAML 2.0"
        LDAP = "ldap", "LDAP"
        ACTIVE_DIRECTORY = "active_directory", "Active Directory"

    class Status(models.TextChoices):
        UNTESTED = "untested", "Non testé"
        READY = "ready", "Opérationnel"
        ERROR = "error", "Erreur"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    alias = models.SlugField(max_length=80, unique=True)
    display_name = models.CharField(max_length=180)
    provider = models.CharField(max_length=24, choices=Provider.choices)
    enabled = models.BooleanField(default=False)
    config_encrypted = models.TextField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.UNTESTED)
    last_error = models.TextField(blank=True)
    keycloak_resource_id = models.CharField(max_length=255, blank=True)
    last_tested_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="created_identity_providers")
    updated_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="updated_identity_providers")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["display_name"]


class WebhookDelivery(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    endpoint = models.ForeignKey(WebhookEndpoint, on_delete=models.CASCADE, related_name="deliveries")
    event = models.CharField(max_length=120)
    payload = models.JSONField(default=dict)
    attempt = models.PositiveSmallIntegerField(default=1)
    response_status = models.PositiveSmallIntegerField(null=True, blank=True)
    response_body = models.TextField(blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    next_attempt_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class AuditHead(models.Model):
    singleton = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    event_hash = models.CharField(max_length=64, blank=True)
    next_sequence = models.PositiveBigIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        self.singleton = 1
        return super().save(*args, **kwargs)


class ImmutableAuditQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise ValueError("Les événements d’audit sont immuables.")

    def delete(self):
        raise ValueError("Les événements d’audit sont immuables.")


class AuditEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sequence = models.PositiveBigIntegerField(unique=True, editable=False)
    actor = models.ForeignKey(User, null=True, blank=True, on_delete=models.PROTECT)
    actor_snapshot = models.JSONField(default=dict, blank=True)
    action = models.CharField(max_length=120)
    resource_type = models.CharField(max_length=80)
    resource_id = models.CharField(max_length=80)
    metadata = models.JSONField(default=dict, blank=True)
    before = models.JSONField(null=True, blank=True)
    after = models.JSONField(null=True, blank=True)
    request_id = models.CharField(max_length=80, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    previous_hash = models.CharField(max_length=64, blank=True)
    event_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    objects = ImmutableAuditQuerySet.as_manager()

    class Meta:
        ordering = ["-sequence"]
        indexes = [
            models.Index(fields=["resource_type", "resource_id", "created_at"]),
            models.Index(fields=["actor", "created_at"]),
        ]

    def _canonical_payload(self):
        return {
            "id": str(self.id),
            "sequence": self.sequence,
            "actor_id": self.actor_id,
            "actor_snapshot": self.actor_snapshot,
            "action": self.action,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "metadata": self.metadata,
            "before": self.before,
            "after": self.after,
            "request_id": self.request_id,
            "ip_address": self.ip_address,
            "previous_hash": self.previous_hash,
            "created_at": self.created_at.isoformat(),
        }

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValueError("Les événements d’audit sont immuables.")
        if self.actor_id and not self.actor_snapshot:
            self.actor_snapshot = {
                "id": self.actor_id,
                "username": self.actor.username,
                "email": self.actor.email,
                "name": self.actor.get_full_name(),
            }
        with transaction.atomic():
            head, _ = AuditHead.objects.select_for_update().get_or_create(singleton=1)
            self.sequence = head.next_sequence
            self.previous_hash = head.event_hash
            canonical = json.dumps(self._canonical_payload(), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
            self.event_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
            result = super().save(*args, **kwargs)
            head.event_hash = self.event_hash
            head.next_sequence += 1
            head.save(update_fields=["event_hash", "next_sequence", "updated_at"])
            return result

    def delete(self, *args, **kwargs):
        raise ValueError("Les événements d’audit sont immuables.")
