import base64
import hashlib
import json
import mimetypes
import re
import uuid
import zipfile
from pathlib import Path

from django.conf import settings
from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from .capabilities import ALL_CAPABILITIES, effective_role_slugs
from .configuration import CURRENT_SCHEMA_VERSION, compile_configuration
from .crypto import decrypt_secret, encrypt_secret
from .exceptions import PreconditionRequired, StaleVersion
from .identity import IdentityProviderError, public_identity_config, validate_identity_config
from .models import (
    AccessGroup,
    AccessRole,
    AuditEvent,
    BackupJob,
    ConfigurationDefinition,
    ConfigurationVersion,
    Correspondence,
    CorrespondenceAccessGrant,
    Document,
    DocumentVersion,
    GenericListItem,
    GroupMembership,
    IdentityProviderConfiguration,
    ListInstance,
    Notification,
    OrganizationSettings,
    OrganizationUnit,
    SavedSearch,
    SignatureProof,
    SystemSetting,
    TransferJob,
    UserPreference,
    UserProfile,
    UserRoleAssignment,
    WebhookEndpoint,
    WorkflowEvent,
    WorkflowTask,
    normalize_grant_capabilities,
)
from .runtime import (
    ConfigurationRuntimeError,
    resolve_runtime_bundle,
    rule_validation_errors,
    validate_form_values,
)
from .services import (
    apply_rule_side_effects,
    assert_if_match,
    grant_default_correspondence_access,
    record_audit,
    sync_role_assignments,
    sync_service_membership,
)


class OrganizationUnitSerializer(serializers.ModelSerializer):
    parent_code = serializers.SlugRelatedField(
        source="parent",
        slug_field="code",
        queryset=OrganizationUnit.objects.filter(active=True),
        allow_null=True,
        required=False,
    )

    class Meta:
        model = OrganizationUnit
        fields = ["id", "code", "name", "parent_code", "active"]


class HealthSerializer(serializers.Serializer):
    status = serializers.CharField()
    database = serializers.CharField()
    cache = serializers.CharField()
    storage = serializers.CharField()
    timestamp = serializers.DateTimeField()
    version = serializers.CharField()


class PublicOrganizationSerializer(serializers.Serializer):
    name = serializers.CharField()
    application_name = serializers.CharField()
    primary_color = serializers.CharField()
    accent_color = serializers.CharField()
    logo_data_url = serializers.CharField(allow_null=True)
    favicon_data_url = serializers.CharField(allow_null=True)
    footer_text = serializers.CharField(allow_blank=True)
    default_home = serializers.CharField()
    locale = serializers.CharField()
    timezone = serializers.CharField()
    row_version = serializers.IntegerField()
    logo_file_name = serializers.CharField(allow_null=True, required=False)
    logo_mime_type = serializers.CharField(allow_null=True, required=False)
    banner_url = serializers.CharField(allow_blank=True, required=False)
    font_family = serializers.CharField(required=False)


class PublicOidcSerializer(serializers.Serializer):
    authority = serializers.CharField()
    client_id = serializers.CharField()


class UploadPolicySerializer(serializers.Serializer):
    max_bytes = serializers.IntegerField()
    allowed_types = serializers.ListField(child=serializers.CharField())


class PublicConfigSerializer(serializers.Serializer):
    version = serializers.CharField()
    organization = PublicOrganizationSerializer()
    oidc = PublicOidcSerializer()
    setup_required = serializers.BooleanField()
    uploads = UploadPolicySerializer()
    numbering = serializers.JSONField()
    navigation = serializers.ListField(child=serializers.DictField())
    signatures = serializers.JSONField()


class MeSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    subject = serializers.CharField()
    email = serializers.EmailField(allow_blank=True)
    first_name = serializers.CharField(allow_blank=True)
    last_name = serializers.CharField(allow_blank=True)
    title = serializers.CharField(allow_blank=True)
    organization_unit = OrganizationUnitSerializer(allow_null=True)
    roles = serializers.ListField(child=serializers.CharField())
    capabilities = serializers.ListField(child=serializers.CharField())
    groups = serializers.ListField(child=serializers.CharField())
    access_pending = serializers.BooleanField()


class DocumentVersionSerializer(serializers.ModelSerializer):
    scan_status_label = serializers.CharField(source="get_scan_status_display", read_only=True)
    extraction_status_label = serializers.CharField(source="get_extraction_status_display", read_only=True)
    download_url = serializers.SerializerMethodField()
    author = serializers.SerializerMethodField()

    class Meta:
        model = DocumentVersion
        fields = [
            "id",
            "document_id",
            "version",
            "filename",
            "mime_type",
            "detected_mime_type",
            "size",
            "sha256",
            "scan_status",
            "scan_status_label",
            "extraction_status",
            "extraction_status_label",
            "author",
            "created_at",
            "download_url",
        ]

    def get_download_url(self, obj) -> str | None:
        if obj.scan_status != DocumentVersion.ScanStatus.CLEAN:
            return None
        return f"/api/v1/correspondences/{obj.correspondence_id}/documents/{obj.id}/download/"

    def get_author(self, obj) -> str:
        return obj.created_by.get_full_name() or obj.created_by.username


class DocumentSerializer(serializers.ModelSerializer):
    versions = DocumentVersionSerializer(many=True, read_only=True)

    class Meta:
        model = Document
        fields = ["id", "title", "kind", "active_version_number", "created_at", "updated_at", "versions"]


class WorkflowEventSerializer(serializers.ModelSerializer):
    actor = serializers.SerializerMethodField()

    class Meta:
        model = WorkflowEvent
        fields = ["id", "event", "from_status", "to_status", "actor", "comment", "metadata", "created_at"]

    def get_actor(self, obj) -> str:
        return obj.actor.get_full_name() or obj.actor.username


class SignatureProofSerializer(serializers.ModelSerializer):
    signer = serializers.SerializerMethodField()

    class Meta:
        model = SignatureProof
        fields = [
            "id",
            "document_version_id",
            "level",
            "status",
            "signer",
            "signer_role",
            "document_hash",
            "evidence",
            "policy_version_id",
            "provider",
            "ip_address",
            "signed_at",
            "created_at",
        ]

    def get_signer(self, obj) -> str:
        return obj.signer.get_full_name() or obj.signer.username


class CorrespondenceSerializer(serializers.ModelSerializer):
    direction_code = serializers.SlugRelatedField(
        source="direction",
        slug_field="code",
        queryset=OrganizationUnit.objects.filter(active=True),
    )
    responsible_service_code = serializers.SlugRelatedField(
        source="responsible_service",
        slug_field="code",
        queryset=OrganizationUnit.objects.filter(active=True),
    )
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    priority_label = serializers.CharField(source="get_priority_display", read_only=True)
    confidentiality_label = serializers.CharField(source="get_confidentiality_display", read_only=True)
    attachment_count = serializers.IntegerField(read_only=True)
    documents = DocumentVersionSerializer(many=True, read_only=True)
    files = DocumentSerializer(many=True, read_only=True)
    workflow_events = WorkflowEventSerializer(many=True, read_only=True)
    signature_proofs = SignatureProofSerializer(many=True, read_only=True)
    created_by = serializers.SerializerMethodField()
    etag = serializers.SerializerMethodField()

    class Meta:
        model = Correspondence
        fields = [
            "id",
            "reference",
            "registry",
            "sender",
            "origin_reference",
            "received_at",
            "channel",
            "subject",
            "direction_code",
            "responsible_service_code",
            "priority",
            "priority_label",
            "confidentiality",
            "confidentiality_label",
            "status",
            "status_label",
            "due_at",
            "summary",
            "custom_data",
            "configuration_version_id",
            "configuration_bundle_id",
            "list_instance_id",
            "attachment_count",
            "documents",
            "files",
            "workflow_events",
            "signature_proofs",
            "created_by",
            "row_version",
            "etag",
            "created_at",
            "updated_at",
            "archived_at",
            "reopened_at",
        ]
        read_only_fields = [
            "reference",
            "status",
            "configuration_version_id",
            "configuration_bundle_id",
            "list_instance_id",
            "row_version",
            "created_at",
            "updated_at",
            "archived_at",
            "reopened_at",
        ]

    def get_created_by(self, obj) -> dict:
        return {
            "id": obj.created_by_id,
            "name": obj.created_by.get_full_name() or obj.created_by.username,
        }

    def get_etag(self, obj) -> str:
        return f'"{obj.row_version}"'

    @transaction.atomic
    def create(self, validated_data):
        request = self.context["request"]
        registry = validated_data["registry"]
        definition_slug = "courriers-internes" if registry == Correspondence.Registry.INTERNAL else "courriers-externes"
        list_instance = ListInstance.objects.filter(
            definition__slug=definition_slug,
            status__in=[ListInstance.Status.ACTIVE, ListInstance.Status.REOPENED],
        ).select_related("configuration_version", "definition", "definition__current_version").first()
        if list_instance is None:
            raise serializers.ValidationError({"registry": "Aucune instance de registre active n’est disponible."})
        try:
            bundle = resolve_runtime_bundle(
                list_instance.definition,
                list_version=list_instance.configuration_version,
            )
        except ConfigurationRuntimeError as exc:
            raise serializers.ValidationError({"configuration": exc.errors}) from exc
        form_values = {
            **validated_data.get("custom_data", {}),
            "sender": validated_data.get("sender"),
            "origin_reference": validated_data.get("origin_reference", ""),
            "received_at": validated_data.get("received_at").isoformat(),
            "subject": validated_data.get("subject"),
            "direction": validated_data.get("direction").code,
            "responsible_service": validated_data.get("responsible_service").code,
            "priority": validated_data.get("priority"),
            "confidentiality": validated_data.get("confidentiality"),
            "summary": validated_data.get("summary", ""),
        }
        normalized, form_errors = validate_form_values(bundle, form_values)
        if form_errors:
            raise serializers.ValidationError({error["path"]: error["message"] for error in form_errors})
        rule_errors = rule_validation_errors(bundle, "create", normalized, has_attachment=False)
        if rule_errors:
            raise serializers.ValidationError({error["path"]: error["message"] for error in rule_errors})
        fixed_fields = {"sender", "origin_reference", "received_at", "subject", "direction", "responsible_service", "priority", "confidentiality", "summary", "attachments"}
        validated_data["custom_data"] = {key: value for key, value in normalized.items() if key not in fixed_fields}
        item = Correspondence.objects.create(
            created_by=request.user,
            list_instance=list_instance,
            configuration_version=bundle.list_version,
            configuration_bundle=bundle,
            **validated_data,
        )
        grant_default_correspondence_access(item, request.user)
        apply_rule_side_effects(item, "create", request.user, request=request)
        record_audit(
            actor=request.user,
            action="correspondence.created",
            resource_type="correspondence",
            resource_id=item.id,
            request=request,
            after={
                "registry": item.registry,
                "subject": item.subject,
                "status": item.status,
                "responsible_service": item.responsible_service.code,
            },
        )
        return item

    @transaction.atomic
    def update(self, instance, validated_data):
        request = self.context["request"]
        locked = Correspondence.objects.select_for_update().get(pk=instance.pk)
        expected = request.headers.get("If-Match")
        if expected is None:
            raise PreconditionRequired()
        if expected.strip().removeprefix("W/").strip('"') != str(locked.row_version):
            raise StaleVersion()
        if locked.status not in {Correspondence.Status.DRAFT, Correspondence.Status.TO_PROCESS}:
            raise serializers.ValidationError({"status": "Ce courrier ne peut plus être modifié dans son état actuel."})
        bundle = locked.configuration_bundle
        if bundle is None and locked.list_instance_id:
            try:
                bundle = resolve_runtime_bundle(
                    locked.list_instance.definition,
                    list_version=locked.list_instance.configuration_version,
                )
            except ConfigurationRuntimeError as exc:
                raise serializers.ValidationError({"configuration": exc.errors}) from exc
            locked.configuration_bundle = bundle
            locked.configuration_version = bundle.list_version
        if bundle is not None:
            custom_data = {**locked.custom_data, **validated_data.get("custom_data", {})}
            form_values = {
                **custom_data,
                "sender": validated_data.get("sender", locked.sender),
                "origin_reference": validated_data.get("origin_reference", locked.origin_reference),
                "received_at": validated_data.get("received_at", locked.received_at).isoformat(),
                "subject": validated_data.get("subject", locked.subject),
                "direction": validated_data.get("direction", locked.direction).code,
                "responsible_service": validated_data.get("responsible_service", locked.responsible_service).code,
                "priority": validated_data.get("priority", locked.priority),
                "confidentiality": validated_data.get("confidentiality", locked.confidentiality),
                "summary": validated_data.get("summary", locked.summary),
            }
            normalized, form_errors = validate_form_values(bundle, form_values)
            if form_errors:
                raise serializers.ValidationError({error["path"]: error["message"] for error in form_errors})
            rule_errors = rule_validation_errors(
                bundle,
                "update",
                normalized,
                has_attachment=locked.documents.filter(scan_status=DocumentVersion.ScanStatus.CLEAN).exists(),
            )
            if rule_errors:
                raise serializers.ValidationError({error["path"]: error["message"] for error in rule_errors})
            fixed_fields = {"sender", "origin_reference", "received_at", "subject", "direction", "responsible_service", "priority", "confidentiality", "summary", "attachments"}
            validated_data["custom_data"] = {key: value for key, value in normalized.items() if key not in fixed_fields}
        before = {
            "sender": locked.sender,
            "subject": locked.subject,
            "priority": locked.priority,
            "confidentiality": locked.confidentiality,
            "due_at": locked.due_at,
            "row_version": locked.row_version,
        }
        for field, value in validated_data.items():
            setattr(locked, field, value)
        locked.row_version += 1
        locked.save()
        apply_rule_side_effects(locked, "update", request.user, request=request)
        record_audit(
            actor=request.user,
            action="correspondence.updated",
            resource_type="correspondence",
            resource_id=locked.id,
            request=request,
            before=before,
            after={
                "sender": locked.sender,
                "subject": locked.subject,
                "priority": locked.priority,
                "confidentiality": locked.confidentiality,
                "due_at": locked.due_at,
                "row_version": locked.row_version,
            },
        )
        return locked


def detect_upload_mime(uploaded) -> str | None:
    position = uploaded.tell()
    header = uploaded.read(8192)
    uploaded.seek(position)
    if header.startswith(b"%PDF-"):
        return "application/pdf"
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if header.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if header.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        return "application/msword"
    try:
        if zipfile.is_zipfile(uploaded):
            uploaded.seek(0)
            with zipfile.ZipFile(uploaded) as archive:
                names = set(archive.namelist())
            uploaded.seek(0)
            if "[Content_Types].xml" in names and any(name.startswith("word/") for name in names):
                return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    except (OSError, zipfile.BadZipFile):
        uploaded.seek(0)
    return None


class DocumentUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    document_id = serializers.UUIDField(required=False, allow_null=True)
    title = serializers.CharField(max_length=255, required=False, allow_blank=True)
    kind = serializers.CharField(max_length=60, required=False, default="attachment")

    def validate_file(self, value):
        if value.size > settings.MAX_UPLOAD_SIZE:
            raise serializers.ValidationError(f"La taille maximale est de {settings.MAX_UPLOAD_SIZE // (1024 * 1024)} Mo.")
        detected = detect_upload_mime(value)
        if detected not in settings.ALLOWED_UPLOAD_TYPES:
            raise serializers.ValidationError("Le contenu du fichier ne correspond pas à un format autorisé.")
        declared = value.content_type
        if declared not in {detected, "application/octet-stream"}:
            raise serializers.ValidationError("Le type déclaré du fichier ne correspond pas à son contenu.")
        expected_extension = {
            "application/pdf": {".pdf"},
            "image/png": {".png"},
            "image/jpeg": {".jpg", ".jpeg"},
            "application/msword": {".doc"},
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {".docx"},
        }[detected]
        if Path(value.name).suffix.lower() not in expected_extension:
            raise serializers.ValidationError("L’extension du fichier ne correspond pas à son contenu.")
        value.numa_detected_mime = detected
        return value

    def validate_document_id(self, value):
        if value is None:
            return value
        correspondence = self.context["correspondence"]
        if not Document.objects.filter(pk=value, correspondence=correspondence).exists():
            raise serializers.ValidationError("Document logique introuvable dans ce courrier.")
        return value

    @transaction.atomic
    def create(self, validated_data):
        correspondence = Correspondence.objects.select_for_update().get(pk=self.context["correspondence"].pk)
        request = self.context["request"]
        assert_if_match(request, correspondence)
        uploaded = validated_data["file"]
        digest = hashlib.sha256()
        for chunk in uploaded.chunks():
            digest.update(chunk)
        uploaded.seek(0)
        document_id = validated_data.get("document_id")
        if document_id:
            document = Document.objects.select_for_update().get(pk=document_id, correspondence=correspondence)
            last_version = document.versions.order_by("-version").first()
            version = (last_version.version + 1) if last_version else 1
        else:
            document = Document.objects.create(
                correspondence=correspondence,
                title=validated_data.get("title") or uploaded.name,
                kind=validated_data.get("kind", "attachment"),
                created_by=request.user,
            )
            version = 1
        item = DocumentVersion.objects.create(
            document=document,
            correspondence=correspondence,
            version=version,
            file=uploaded,
            filename=uploaded.name,
            mime_type=uploaded.content_type or mimetypes.guess_type(uploaded.name)[0] or "application/octet-stream",
            detected_mime_type=uploaded.numa_detected_mime,
            size=uploaded.size,
            sha256=digest.hexdigest(),
            created_by=request.user,
        )
        document.active_version_number = version
        document.save(update_fields=["active_version_number", "updated_at"])
        correspondence.row_version += 1
        correspondence.save(update_fields=["row_version", "updated_at"])
        record_audit(
            actor=request.user,
            action="document.uploaded",
            resource_type="document",
            resource_id=document.id,
            request=request,
            metadata={
                "version_id": str(item.id),
                "version": version,
                "filename": item.filename,
                "sha256": item.sha256,
                "detected_mime_type": item.detected_mime_type,
            },
        )
        return item


class DocumentUploadResponseSerializer(serializers.Serializer):
    document = DocumentVersionSerializer()
    row_version = serializers.IntegerField()
    etag = serializers.CharField()


class TransitionSerializer(serializers.Serializer):
    comment = serializers.CharField(required=False, allow_blank=True, max_length=4000)


class SignatureRequestSerializer(serializers.Serializer):
    document_version_id = serializers.UUIDField()
    level = serializers.ChoiceField(choices=SignatureProof.Level.choices)
    graphic_mark = serializers.CharField(required=False, allow_blank=True, max_length=100_000)


class CorrespondenceAccessGrantSerializer(serializers.ModelSerializer):
    user_id = serializers.PrimaryKeyRelatedField(source="user", queryset=User.objects.filter(is_active=True), allow_null=True, required=False)
    group_id = serializers.PrimaryKeyRelatedField(source="group", queryset=AccessGroup.objects.filter(active=True), allow_null=True, required=False)
    principal_name = serializers.SerializerMethodField()

    class Meta:
        model = CorrespondenceAccessGrant
        fields = ["id", "user_id", "group_id", "principal_name", "capabilities", "source", "expires_at", "created_at"]
        read_only_fields = ["id", "source", "created_at"]

    def get_principal_name(self, obj):
        if obj.user_id:
            return obj.user.get_full_name() or obj.user.username
        return obj.group.name

    def validate_capabilities(self, value):
        capabilities = normalize_grant_capabilities(value)
        allowed = {
            "correspondence.read", "correspondence.update", "correspondence.submit",
            "correspondence.validate", "correspondence.reject", "correspondence.cancel",
            "correspondence.reopen", "correspondence.archive", "correspondence.sign",
            "correspondence.manage_acl", "document.upload", "document.download",
        }
        if not capabilities or set(capabilities) - allowed:
            raise serializers.ValidationError("Une ou plusieurs capacités sont invalides.")
        return capabilities

    def validate(self, attrs):
        if bool(attrs.get("user")) == bool(attrs.get("group")):
            raise serializers.ValidationError("Un droit doit viser exactement un utilisateur ou un groupe.")
        return attrs


class AccessRoleSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="slug", read_only=True)
    permissions = serializers.ListField(source="capabilities", child=serializers.CharField(), required=False)

    class Meta:
        model = AccessRole
        fields = ["id", "slug", "label", "description", "permissions", "protected", "active", "created_at", "updated_at"]
        read_only_fields = ["protected", "created_at", "updated_at"]

    def validate_permissions(self, value):
        unknown = set(value) - ALL_CAPABILITIES
        if unknown:
            raise serializers.ValidationError(f"Capacités inconnues : {', '.join(sorted(unknown))}")
        return sorted(set(value))


def _split_name(name: str):
    first, _, last = name.strip().partition(" ")
    return first, last


class DirectoryUserSerializer(serializers.Serializer):
    id = serializers.SerializerMethodField()
    name = serializers.CharField(max_length=301, write_only=True)
    initials = serializers.SerializerMethodField()
    email = serializers.EmailField(write_only=True)
    department = serializers.SerializerMethodField()
    department_code = serializers.SlugRelatedField(
        source="organization_unit",
        slug_field="code",
        queryset=OrganizationUnit.objects.filter(active=True),
        allow_null=True,
        required=False,
    )
    title = serializers.CharField(max_length=180, required=False, allow_blank=True)
    status = serializers.SerializerMethodField()
    active = serializers.BooleanField(required=False, write_only=True)
    roles = serializers.ListField(child=serializers.SlugRelatedField(slug_field="slug", queryset=AccessRole.objects.filter(active=True)), required=False, write_only=True)
    groups = serializers.ListField(child=serializers.PrimaryKeyRelatedField(queryset=AccessGroup.objects.filter(active=True)), required=False, write_only=True)
    last_login = serializers.SerializerMethodField()
    identity_subject = serializers.CharField(max_length=255, required=False, write_only=True)

    def get_id(self, obj) -> str:
        return str(obj.user_id)

    def get_initials(self, obj) -> str:
        name = obj.user.get_full_name() or obj.user.username
        return "".join(part[0].upper() for part in name.split()[:2])

    def get_department(self, obj) -> str:
        return obj.organization_unit.name if obj.organization_unit else ""

    def get_status(self, obj) -> str:
        if not obj.active or not obj.user.is_active:
            return "Inactif"
        if obj.access_requested_at and not effective_role_slugs(obj.user):
            return "Invitation en attente"
        return "Actif"

    def get_last_login(self, obj) -> str:
        value = obj.last_seen_at or obj.user.last_login
        return value.isoformat() if value else ""

    def to_representation(self, instance):
        value = super().to_representation(instance)
        value["name"] = instance.user.get_full_name() or instance.user.username
        value["email"] = instance.user.email
        value["roles"] = sorted(effective_role_slugs(instance.user))
        value["groups"] = [str(item) for item in instance.group_memberships.values_list("group_id", flat=True)]
        return value

    @transaction.atomic
    def create(self, validated_data):
        roles = validated_data.pop("roles", [])
        groups = validated_data.pop("groups", [])
        organization_unit = validated_data.pop("organization_unit", None)
        name = validated_data.pop("name")
        email = validated_data.pop("email")
        title = validated_data.pop("title", "")
        active = validated_data.pop("active", True)
        identity_subject = validated_data.pop("identity_subject", "")
        first_name, last_name = _split_name(name)
        base_username = email.split("@", 1)[0][:140]
        username = base_username
        suffix = 1
        while User.objects.filter(username=username).exists():
            suffix += 1
            username = f"{base_username}-{suffix}"[:150]
        user = User.objects.create(
            username=username,
            email=email,
            first_name=first_name[:150],
            last_name=last_name[:150],
            is_active=active,
        )
        profile = UserProfile.objects.create(
            user=user,
            keycloak_subject=identity_subject or f"pending:{uuid.uuid4()}",
            organization_unit=organization_unit,
            title=title,
            roles=[role.slug for role in roles],
            active=active,
            access_requested_at=timezone.now(),
        )
        sync_role_assignments(profile, [role.slug for role in roles], source=UserRoleAssignment.Source.MANUAL)
        sync_service_membership(profile)
        for group in groups:
            GroupMembership.objects.get_or_create(profile=profile, group=group)
        request = self.context["request"]
        record_audit(actor=request.user, action="identity.user.created", resource_type="user", resource_id=user.id, request=request, after={"email": email, "roles": [role.slug for role in roles]})
        return profile

    @transaction.atomic
    def update(self, instance, validated_data):
        roles = validated_data.pop("roles", None)
        groups = validated_data.pop("groups", None)
        name = validated_data.pop("name", None)
        email = validated_data.pop("email", None)
        active = validated_data.pop("active", None)
        before = {"email": instance.user.email, "roles": sorted(effective_role_slugs(instance.user)), "active": instance.active}
        if name is not None:
            instance.user.first_name, instance.user.last_name = _split_name(name)
        if email is not None:
            instance.user.email = email
        if active is not None:
            instance.active = active
            instance.user.is_active = active
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.user.save()
        instance.save()
        if roles is not None:
            sync_role_assignments(instance, [role.slug for role in roles], source=UserRoleAssignment.Source.MANUAL)
            instance.roles = sorted(effective_role_slugs(instance.user))
            instance.save(update_fields=["roles"])
        if groups is not None:
            instance.group_memberships.filter(source=GroupMembership.Source.MANUAL).delete()
            sync_service_membership(instance)
            for group in groups:
                GroupMembership.objects.get_or_create(profile=instance, group=group)
        request = self.context["request"]
        record_audit(actor=request.user, action="identity.user.updated", resource_type="user", resource_id=instance.user_id, request=request, before=before, after={"email": instance.user.email, "roles": sorted(effective_role_slugs(instance.user)), "active": instance.active})
        return instance


class AccessGroupSerializer(serializers.ModelSerializer):
    member_ids = serializers.ListField(child=serializers.PrimaryKeyRelatedField(queryset=UserProfile.objects.filter(active=True)), required=False)
    role_ids = serializers.ListField(child=serializers.SlugRelatedField(slug_field="slug", queryset=AccessRole.objects.filter(active=True)), required=False)
    source_label = serializers.CharField(source="get_source_display", read_only=True)

    class Meta:
        model = AccessGroup
        fields = ["id", "name", "description", "source", "source_label", "external_id", "organization_unit", "member_ids", "role_ids", "active", "created_at", "updated_at"]
        read_only_fields = ["created_at", "updated_at"]

    def to_representation(self, instance):
        value = super().to_representation(instance)
        value["member_ids"] = [str(item) for item in instance.memberships.values_list("profile__user_id", flat=True)]
        value["role_ids"] = list(instance.roles.values_list("slug", flat=True))
        return value

    @transaction.atomic
    def create(self, validated_data):
        members = validated_data.pop("member_ids", [])
        roles = validated_data.pop("role_ids", [])
        group = AccessGroup.objects.create(**validated_data)
        group.roles.set(roles)
        for profile in members:
            GroupMembership.objects.get_or_create(profile=profile, group=group)
        return group

    @transaction.atomic
    def update(self, instance, validated_data):
        members = validated_data.pop("member_ids", None)
        roles = validated_data.pop("role_ids", None)
        if instance.source == AccessGroup.Source.DIRECTORY:
            protected = {"name", "external_id", "organization_unit"}
            if protected.intersection(validated_data):
                raise serializers.ValidationError("Les propriétés synchronisées d’un groupe d’annuaire sont en lecture seule.")
        instance = super().update(instance, validated_data)
        if roles is not None:
            instance.roles.set(roles)
        if members is not None:
            instance.memberships.filter(source=GroupMembership.Source.MANUAL).delete()
            for profile in members:
                GroupMembership.objects.get_or_create(profile=profile, group=instance)
        return instance


class ConfigurationVersionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConfigurationVersion
        fields = [
            "id", "version", "state", "schema_version", "data", "compiled_data", "dependencies",
            "content_hash", "validation_errors", "created_at", "published_at",
        ]
        read_only_fields = fields


class ConfigurationDefinitionSerializer(serializers.ModelSerializer):
    current_version = ConfigurationVersionSerializer(read_only=True)
    latest_version = serializers.SerializerMethodField()
    data = serializers.JSONField(write_only=True, required=False)
    schema_version = serializers.IntegerField(write_only=True, required=False, min_value=1, max_value=CURRENT_SCHEMA_VERSION)

    class Meta:
        model = ConfigurationDefinition
        fields = ["id", "kind", "slug", "name", "description", "active", "current_version", "latest_version", "data", "schema_version", "created_at", "updated_at"]
        read_only_fields = ["created_at", "updated_at"]

    def get_latest_version(self, obj) -> dict | None:
        version = obj.versions.order_by("-version").first()
        return ConfigurationVersionSerializer(version).data if version else None

    @transaction.atomic
    def create(self, validated_data):
        data = validated_data.pop("data", {})
        schema_version = validated_data.pop("schema_version", CURRENT_SCHEMA_VERSION)
        request = self.context["request"]
        definition = ConfigurationDefinition.objects.create(created_by=request.user, **validated_data)
        compiled = compile_configuration(definition.kind, data, schema_version)
        ConfigurationVersion.objects.create(
            definition=definition,
            version=1,
            state=ConfigurationVersion.State.DRAFT,
            data=data,
            schema_version=schema_version,
            compiled_data=compiled.data,
            dependencies=compiled.dependencies,
            content_hash=compiled.content_hash,
            validation_errors=compiled.errors,
            created_by=request.user,
        )
        record_audit(actor=request.user, action="configuration.created", resource_type="configuration", resource_id=definition.id, request=request, after={"kind": definition.kind, "slug": definition.slug, "version": 1})
        return definition

    @transaction.atomic
    def update(self, instance, validated_data):
        request = self.context["request"]
        locked = ConfigurationDefinition.objects.select_for_update().get(pk=instance.pk)
        latest = locked.versions.order_by("-version").first()
        expected = request.headers.get("If-Match")
        if expected is None:
            raise PreconditionRequired("La version de configuration doit être fournie avec If-Match.")
        if latest and expected.strip().removeprefix("W/").strip('"') != str(latest.version):
            raise StaleVersion("Une version plus récente de cette configuration existe déjà.")
        data = validated_data.pop("data", latest.data if latest else {})
        schema_version = validated_data.pop(
            "schema_version",
            latest.schema_version if latest else CURRENT_SCHEMA_VERSION,
        )
        for field, value in validated_data.items():
            setattr(locked, field, value)
        locked.save()
        version_number = (latest.version + 1) if latest else 1
        compiled = compile_configuration(locked.kind, data, schema_version)
        ConfigurationVersion.objects.create(
            definition=locked,
            version=version_number,
            state=ConfigurationVersion.State.DRAFT,
            data=data,
            schema_version=schema_version,
            compiled_data=compiled.data,
            dependencies=compiled.dependencies,
            content_hash=compiled.content_hash,
            validation_errors=compiled.errors,
            created_by=request.user,
        )
        record_audit(actor=request.user, action="configuration.draft.created", resource_type="configuration", resource_id=locked.id, request=request, metadata={"version": version_number, "validation_errors": compiled.errors, "content_hash": compiled.content_hash})
        return locked


class OrganizationSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrganizationSettings
        fields = [
            "organization_name", "application_name", "primary_color", "accent_color", "logo_data_url",
            "favicon_data_url", "footer_text", "default_home", "locale", "timezone", "configured", "settings",
            "row_version", "updated_at",
        ]
        read_only_fields = ["configured", "row_version", "updated_at"]

    def validate_primary_color(self, value):
        if not re.fullmatch(r"#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?", value):
            raise serializers.ValidationError("Utilisez une couleur hexadécimale, par exemple #123E7C.")
        return value.upper()

    def validate_accent_color(self, value):
        return self.validate_primary_color(value)

    def _validate_image_data_url(self, value, *, max_size):
        if not value:
            return ""
        match = re.fullmatch(r"data:(image/png|image/svg\+xml);base64,([A-Za-z0-9+/=\s]+)", value)
        if not match:
            raise serializers.ValidationError("Seules les images PNG ou SVG encodées en base64 sont acceptées.")
        try:
            content = base64.b64decode(match.group(2), validate=True)
        except ValueError as exc:
            raise serializers.ValidationError("L’image base64 est invalide.") from exc
        if len(content) > max_size:
            raise serializers.ValidationError("L’image dépasse la taille maximale autorisée.")
        if match.group(1) == "image/png" and not content.startswith(b"\x89PNG\r\n\x1a\n"):
            raise serializers.ValidationError("Le contenu ne correspond pas à une image PNG.")
        if match.group(1) == "image/svg+xml":
            lowered = content.lower()
            forbidden = (b"<script", b"javascript:", b"onload=", b"onerror=", b"<foreignobject", b"<!entity")
            if not content.lstrip().startswith(b"<svg") and b"<svg" not in content[:500].lower():
                raise serializers.ValidationError("Le contenu ne correspond pas à une image SVG.")
            if any(token in lowered for token in forbidden):
                raise serializers.ValidationError("Le SVG contient un élément actif interdit.")
        return value

    def validate_logo_data_url(self, value):
        return self._validate_image_data_url(value, max_size=2 * 1024 * 1024)

    def validate_favicon_data_url(self, value):
        return self._validate_image_data_url(value, max_size=512 * 1024)

    def update(self, instance, validated_data):
        request = self.context["request"]
        if instance.configured:
            expected = request.headers.get("If-Match")
            if expected is None:
                raise PreconditionRequired("La version des réglages doit être fournie avec If-Match.")
            if expected.strip().removeprefix("W/").strip('"') != str(instance.row_version):
                raise StaleVersion("Les réglages ont été modifiés par un autre utilisateur.")
        before = OrganizationSettingsSerializer(instance).data
        instance.row_version += 1
        instance = super().update(instance, validated_data)
        instance.updated_by = request.user
        instance.save(update_fields=["updated_by", "row_version", "updated_at"])
        record_audit(actor=request.user, action="organization.settings.updated", resource_type="organization_settings", resource_id=1, request=request, before=before, after=OrganizationSettingsSerializer(instance).data)
        return instance


class UserPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserPreference
        fields = [
            "locale", "timezone", "default_home", "theme", "page_size", "compact_mode",
            "web_notifications", "email_notifications", "settings", "row_version", "updated_at",
        ]
        read_only_fields = ["row_version", "updated_at"]

    def validate_page_size(self, value):
        if value not in {10, 25, 50, 100}:
            raise serializers.ValidationError("Choisissez 10, 25, 50 ou 100 éléments par page.")
        return value

    def validate_settings(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Les préférences complémentaires doivent être un objet JSON.")
        if len(json.dumps(value, ensure_ascii=False)) > 32_000:
            raise serializers.ValidationError("Les préférences complémentaires sont trop volumineuses.")
        return value

    def update(self, instance, validated_data):
        request = self.context["request"]
        expected = request.headers.get("If-Match")
        if expected is None:
            raise PreconditionRequired("La version des préférences doit être fournie avec If-Match.")
        if expected.strip().removeprefix("W/").strip('"') != str(instance.row_version):
            raise StaleVersion("Les préférences ont été modifiées dans une autre session.")
        before = UserPreferenceSerializer(instance).data
        instance.row_version += 1
        instance = super().update(instance, validated_data)
        instance.save(update_fields=["row_version", "updated_at"])
        record_audit(
            actor=request.user,
            action="user.preferences.updated",
            resource_type="user_preference",
            resource_id=request.user.id,
            request=request,
            before=before,
            after=UserPreferenceSerializer(instance).data,
        )
        return instance


class SystemSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSetting
        fields = ["section", "values", "row_version", "created_at", "updated_at"]
        read_only_fields = ["row_version", "created_at", "updated_at"]

    def validate_values(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Les paramètres doivent être un objet JSON.")
        forbidden = {"password", "secret", "token", "private_key", "credential"}
        unsafe = {str(key).lower() for key in value if any(part in str(key).lower() for part in forbidden)}
        if unsafe:
            raise serializers.ValidationError(
                "Les secrets de bootstrap et d’intégration ne peuvent pas être stockés dans cette section."
            )
        if len(json.dumps(value, ensure_ascii=False)) > 64_000:
            raise serializers.ValidationError("Cette section de paramètres est trop volumineuse.")
        return value

    def create(self, validated_data):
        validated_data["updated_by"] = self.context["request"].user
        instance = super().create(validated_data)
        record_audit(
            actor=self.context["request"].user,
            action="system.settings.created",
            resource_type="system_setting",
            resource_id=instance.section,
            request=self.context["request"],
            after=SystemSettingSerializer(instance).data,
        )
        return instance

    def update(self, instance, validated_data):
        request = self.context["request"]
        expected = request.headers.get("If-Match")
        if expected is None:
            raise PreconditionRequired("La version de cette section doit être fournie avec If-Match.")
        if expected.strip().removeprefix("W/").strip('"') != str(instance.row_version):
            raise StaleVersion("Cette section a été modifiée par un autre administrateur.")
        before = SystemSettingSerializer(instance).data
        instance.row_version += 1
        validated_data["updated_by"] = request.user
        instance = super().update(instance, validated_data)
        instance.save(update_fields=["row_version", "updated_by", "updated_at"])
        record_audit(
            actor=request.user,
            action="system.settings.updated",
            resource_type="system_setting",
            resource_id=instance.section,
            request=request,
            before=before,
            after=SystemSettingSerializer(instance).data,
        )
        return instance


class IdentityProviderConfigurationSerializer(serializers.ModelSerializer):
    config = serializers.JSONField(write_only=True, required=False)

    class Meta:
        model = IdentityProviderConfiguration
        fields = [
            "id", "alias", "display_name", "provider", "enabled", "config", "status", "last_error",
            "keycloak_resource_id", "last_tested_at", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "status", "last_error", "keycloak_resource_id", "last_tested_at", "created_at", "updated_at",
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        try:
            config = json.loads(decrypt_secret(instance.config_encrypted)) if instance.config_encrypted else {}
            data["config"] = public_identity_config(config)
        except (ValueError, TypeError, json.JSONDecodeError):
            data["config"] = {"configuration_unreadable": True}
        return data

    def _merged_config(self, instance, incoming):
        current = {}
        if instance and instance.config_encrypted:
            try:
                current = json.loads(decrypt_secret(instance.config_encrypted))
            except (ValueError, json.JSONDecodeError) as exc:
                raise serializers.ValidationError({"config": "La configuration existante ne peut pas être déchiffrée."}) from exc
        incoming = dict(incoming or {})
        for secret in ("client_secret", "bind_credential", "private_key"):
            if incoming.get(secret) in {None, ""} and current.get(secret):
                incoming[secret] = current[secret]
        current.update(incoming)
        provider = self.initial_data.get("provider") or (instance.provider if instance else None)
        try:
            return validate_identity_config(provider, current)
        except IdentityProviderError as exc:
            raise serializers.ValidationError({"config": str(exc)}) from exc

    def create(self, validated_data):
        request = self.context["request"]
        config = self._merged_config(None, validated_data.pop("config", {}))
        instance = IdentityProviderConfiguration.objects.create(
            config_encrypted=encrypt_secret(json.dumps(config)),
            created_by=request.user,
            updated_by=request.user,
            **validated_data,
        )
        record_audit(
            actor=request.user,
            action="identity.provider.created",
            resource_type="identity_provider",
            resource_id=instance.id,
            request=request,
            after={"alias": instance.alias, "provider": instance.provider, "enabled": instance.enabled},
        )
        return instance

    def update(self, instance, validated_data):
        request = self.context["request"]
        config = self._merged_config(instance, validated_data.pop("config", {}))
        before = {"alias": instance.alias, "provider": instance.provider, "enabled": instance.enabled, "status": instance.status}
        instance.config_encrypted = encrypt_secret(json.dumps(config))
        instance.status = IdentityProviderConfiguration.Status.UNTESTED
        instance.last_error = ""
        instance.updated_by = request.user
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        record_audit(
            actor=request.user,
            action="identity.provider.updated",
            resource_type="identity_provider",
            resource_id=instance.id,
            request=request,
            before=before,
            after={"alias": instance.alias, "provider": instance.provider, "enabled": instance.enabled, "status": instance.status},
        )
        return instance


class WorkflowTaskSerializer(serializers.ModelSerializer):
    correspondence_id = serializers.UUIDField(source="workflow.correspondence_id", read_only=True)
    correspondence_row_version = serializers.IntegerField(source="workflow.correspondence.row_version", read_only=True)
    registry = serializers.CharField(source="workflow.correspondence.registry", read_only=True)
    reference = serializers.CharField(source="workflow.correspondence.reference", read_only=True)
    subject = serializers.CharField(source="workflow.correspondence.subject", read_only=True)
    requester = serializers.SerializerMethodField()
    priority = serializers.CharField(source="workflow.correspondence.priority", read_only=True)
    assignee_name = serializers.SerializerMethodField()
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = WorkflowTask
        fields = ["id", "correspondence_id", "correspondence_row_version", "registry", "reference", "subject", "requester", "priority", "step_key", "label", "kind", "kind_label", "status", "status_label", "assignee_id", "assignee_group_id", "assignee_name", "due_at", "comment", "created_at", "completed_at"]
        read_only_fields = ["id", "status", "comment", "created_at", "completed_at"]

    def get_requester(self, obj) -> str:
        user = obj.workflow.correspondence.created_by
        return user.get_full_name() or user.username

    def get_assignee_name(self, obj) -> str:
        if obj.assignee:
            return obj.assignee.get_full_name() or obj.assignee.username
        return obj.assignee_group.name if obj.assignee_group else "Non assignée"


class NotificationSerializer(serializers.ModelSerializer):
    read = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = ["id", "title", "detail", "created_at", "kind", "read", "read_at", "path", "data"]
        read_only_fields = fields

    def get_read(self, obj) -> bool:
        return obj.read_at is not None


class AuditEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    integrity_valid = serializers.SerializerMethodField()

    class Meta:
        model = AuditEvent
        fields = ["id", "sequence", "actor_snapshot", "actor_name", "action", "resource_type", "resource_id", "metadata", "before", "after", "request_id", "ip_address", "previous_hash", "event_hash", "integrity_valid", "created_at"]
        read_only_fields = fields

    def get_actor_name(self, obj) -> str:
        return obj.actor_snapshot.get("name") or obj.actor_snapshot.get("username") or "Système"

    def get_integrity_valid(self, obj) -> bool:
        return bool(obj.event_hash)


class CorrespondenceSearchResponseSerializer(serializers.Serializer):
    query = serializers.CharField()
    count = serializers.IntegerField()
    truncated = serializers.BooleanField()
    results = CorrespondenceSerializer(many=True)


class DashboardMetricsSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    to_process = serializers.IntegerField()
    in_validation = serializers.IntegerField()
    validated = serializers.IntegerField()
    overdue = serializers.IntegerField()


class DashboardActivitySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    event = serializers.CharField()
    reference = serializers.CharField(allow_null=True)
    correspondence_id = serializers.UUIDField(required=False)
    registry = serializers.CharField(required=False)
    subject = serializers.CharField()
    actor = serializers.CharField()
    from_status = serializers.CharField(allow_blank=True)
    to_status = serializers.CharField()
    comment = serializers.CharField(allow_blank=True)
    metadata = serializers.JSONField(required=False)
    created_at = serializers.DateTimeField()


class DashboardSeriesPointSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    month = serializers.CharField()
    internal = serializers.IntegerField()
    external = serializers.IntegerField()


class RegistryCountsSerializer(serializers.Serializer):
    internal = serializers.IntegerField()
    external = serializers.IntegerField()


class DashboardResponseSerializer(serializers.Serializer):
    period = serializers.ChoiceField(choices=["7d", "4w", "12m"])
    metrics = DashboardMetricsSerializer()
    recent = CorrespondenceSerializer(many=True)
    tasks = WorkflowTaskSerializer(many=True)
    activity = DashboardActivitySerializer(many=True)
    series = DashboardSeriesPointSerializer(many=True)
    registries = RegistryCountsSerializer()


class ActivityResponseSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    results = DashboardActivitySerializer(many=True)


class DependencyStatusSerializer(serializers.Serializer):
    status = serializers.CharField()


class DatabaseStatusSerializer(DependencyStatusSerializer):
    size = serializers.IntegerField()


class WorkerStatusSerializer(DependencyStatusSerializer):
    broker = serializers.CharField()


class OperationalCountsSerializer(serializers.Serializer):
    users = serializers.IntegerField()
    correspondences = serializers.IntegerField()
    documents = serializers.IntegerField()
    pending_tasks = serializers.IntegerField()


class OperationalStatusSerializer(serializers.Serializer):
    version = serializers.CharField()
    database = DatabaseStatusSerializer()
    cache = DependencyStatusSerializer()
    storage = DependencyStatusSerializer()
    workers = WorkerStatusSerializer()
    counts = OperationalCountsSerializer()
    server_time = serializers.DateTimeField()


class SavedSearchSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedSearch
        fields = ["id", "name", "query", "shared", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def create(self, validated_data):
        return SavedSearch.objects.create(owner=self.context["request"].user, **validated_data)


class TransferJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = TransferJob
        fields = ["id", "kind", "status", "resource_type", "source_file", "result_file", "options", "result", "error", "created_at", "completed_at"]
        read_only_fields = ["id", "status", "result_file", "result", "error", "created_at", "completed_at"]

    def create(self, validated_data):
        return TransferJob.objects.create(created_by=self.context["request"].user, **validated_data)


class BackupJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = BackupJob
        fields = ["id", "status", "destination", "encrypted", "location", "checksum", "size", "error", "created_at", "completed_at"]
        read_only_fields = ["id", "status", "location", "checksum", "size", "error", "created_at", "completed_at"]

    def create(self, validated_data):
        validated_data["encrypted"] = True
        return BackupJob.objects.create(requested_by=self.context["request"].user, **validated_data)


class WebhookEndpointSerializer(serializers.ModelSerializer):
    secret = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = WebhookEndpoint
        fields = ["id", "name", "url", "events", "secret", "active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_events(self, value):
        prefixes = ("correspondence.", "document.", "configuration.", "identity.", "transfer.", "backup.", "system.")
        if not isinstance(value, list) or not all(isinstance(item, str) and (item == "*" or item.startswith(prefixes)) for item in value):
            raise serializers.ValidationError("Événements webhook invalides.")
        return sorted(set(value))

    def create(self, validated_data):
        secret = validated_data.pop("secret", "")
        return WebhookEndpoint.objects.create(
            created_by=self.context["request"].user,
            secret_encrypted=encrypt_secret(secret),
            **validated_data,
        )

    def update(self, instance, validated_data):
        secret = validated_data.pop("secret", None)
        if secret is not None:
            instance.secret_encrypted = encrypt_secret(secret)
        return super().update(instance, validated_data)


class ListInstanceSerializer(serializers.ModelSerializer):
    registry = serializers.SerializerMethodField()
    item_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = ListInstance
        fields = [
            "id", "definition", "period_key", "label", "active", "status", "configuration_version",
            "scheduled_open_at", "opened_at", "scheduled_close_at", "closed_at", "reopened_at", "archived_at",
            "row_version", "created_at", "updated_at",
            "registry", "item_count",
        ]
        read_only_fields = [
            "id", "active", "opened_at", "closed_at", "reopened_at", "archived_at", "row_version", "created_at", "updated_at",
            "registry", "item_count",
        ]

    def get_registry(self, obj) -> str:
        return str((obj.configuration_version.data or {}).get("registry", "custom"))

    def validate(self, attrs):
        definition = attrs.get("definition", getattr(self.instance, "definition", None))
        version = attrs.get("configuration_version", getattr(self.instance, "configuration_version", None))
        if definition and definition.kind != ConfigurationDefinition.Kind.LIST:
            raise serializers.ValidationError({"definition": "Une instance doit dépendre d’une définition de liste."})
        if definition and version and version.definition_id != definition.id:
            raise serializers.ValidationError({"configuration_version": "Cette version n’appartient pas à la liste sélectionnée."})
        if version and version.state not in {
            ConfigurationVersion.State.PUBLISHED,
            ConfigurationVersion.State.ARCHIVED,
        }:
            raise serializers.ValidationError({"configuration_version": "Une instance doit utiliser une version publiée ou archivée."})
        if attrs.get("scheduled_open_at") and attrs.get("scheduled_close_at") and attrs["scheduled_close_at"] <= attrs["scheduled_open_at"]:
            raise serializers.ValidationError({"scheduled_close_at": "La clôture doit être postérieure à l’ouverture."})
        return attrs

    def create(self, validated_data):
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)

    def update(self, instance, validated_data):
        expected = self.context["request"].headers.get("If-Match")
        if expected is None:
            raise PreconditionRequired("La version de l’instance doit être fournie avec If-Match.")
        if expected.strip().removeprefix("W/").strip('"') != str(instance.row_version):
            raise StaleVersion("L’instance a été modifiée par un autre administrateur.")
        instance.row_version += 1
        return super().update(instance, validated_data)


class ListInstanceLifecycleSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    scheduled_at = serializers.DateTimeField(required=False, allow_null=True)


class ListInstanceRolloverSerializer(serializers.Serializer):
    period_key = serializers.CharField(max_length=80)
    label = serializers.CharField(max_length=180)
    scheduled_open_at = serializers.DateTimeField(required=False, allow_null=True)


class NumberingPreviewSerializer(serializers.Serializer):
    registry = serializers.ChoiceField(choices=Correspondence.Registry.choices)
    service_code = serializers.CharField(max_length=20)
    direction_code = serializers.CharField(max_length=20)
    received_at = serializers.DateField(required=False, default=timezone.localdate)
    sequence = serializers.IntegerField(required=False, min_value=1)
    settings = serializers.JSONField(required=False)


class NumberingPreviewResponseSerializer(serializers.Serializer):
    reference = serializers.CharField()
    sequence = serializers.IntegerField()
    scope_key = serializers.CharField()
    available = serializers.BooleanField()


class GenericListItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = GenericListItem
        fields = ["id", "instance", "label", "search_text", "data", "status", "configuration_bundle_id", "row_version", "created_at", "updated_at"]
        read_only_fields = ["id", "configuration_bundle_id", "row_version", "created_at", "updated_at"]

    def create(self, validated_data):
        instance = validated_data["instance"]
        if instance.status not in {ListInstance.Status.ACTIVE, ListInstance.Status.REOPENED}:
            raise serializers.ValidationError({"instance": "Cette instance n’accepte pas de nouveaux éléments."})
        try:
            bundle = resolve_runtime_bundle(
                instance.definition,
                list_version=instance.configuration_version,
            )
        except ConfigurationRuntimeError as exc:
            raise serializers.ValidationError({"configuration": exc.errors}) from exc
        normalized, errors = validate_form_values(bundle, validated_data.get("data", {}))
        if errors:
            raise serializers.ValidationError({error["path"]: error["message"] for error in errors})
        validated_data["data"] = normalized
        return GenericListItem.objects.create(
            created_by=self.context["request"].user,
            configuration_bundle=bundle,
            **validated_data,
        )

    @transaction.atomic
    def update(self, instance, validated_data):
        locked = GenericListItem.objects.select_for_update(of=("self",)).select_related(
            "instance__definition",
            "instance__configuration_version",
            "configuration_bundle",
        ).get(pk=instance.pk)
        expected = self.context["request"].headers.get("If-Match")
        if expected is None:
            raise PreconditionRequired()
        if expected.strip().removeprefix("W/").strip('"') != str(locked.row_version):
            raise StaleVersion()
        bundle = locked.configuration_bundle
        if bundle is None:
            try:
                bundle = resolve_runtime_bundle(
                    locked.instance.definition,
                    list_version=locked.instance.configuration_version,
                )
            except ConfigurationRuntimeError as exc:
                raise serializers.ValidationError({"configuration": exc.errors}) from exc
            locked.configuration_bundle = bundle
        normalized, errors = validate_form_values(bundle, {**locked.data, **validated_data.get("data", {})})
        if errors:
            raise serializers.ValidationError({error["path"]: error["message"] for error in errors})
        validated_data["data"] = normalized
        locked.row_version += 1
        return super().update(locked, validated_data)
