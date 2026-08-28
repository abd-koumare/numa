import hashlib
import hmac
import json
from datetime import date, timedelta
from pathlib import Path

import redis
from django.conf import settings
from django.core.files.storage import default_storage
from django.db import connection, transaction
from django.db.models import Count, Q
from django.db.models.functions import TruncDay, TruncMonth, TruncWeek
from django.http import FileResponse
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import NotAuthenticated, PermissionDenied, ValidationError
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .capabilities import Capability, effective_capabilities, effective_role_slugs, has_capability
from .backup import verify_encrypted_bundle
from .configuration import compile_configuration
from .crypto import decrypt_secret
from .exceptions import PreconditionRequired, StaleVersion, StateConflict
from .identity import IdentityProviderError, KeycloakAdmin, test_identity_provider
from .models import (
    AccessGroup,
    AccessRole,
    AuditEvent,
    AuditHead,
    BackupJob,
    ConfigurationDefinition,
    ConfigurationVersion,
    Correspondence,
    CorrespondenceAccessGrant,
    DocumentVersion,
    GenericListItem,
    IdentityProviderConfiguration,
    ListInstance,
    Notification,
    OrganizationSettings,
    OrganizationUnit,
    SavedSearch,
    SystemSetting,
    TransferJob,
    UserPreference,
    UserProfile,
    WebhookEndpoint,
    WorkflowEvent,
    WorkflowTask,
)
from .permissions import CorrespondencePermission, HasViewCapability
from .signatures import signature_capabilities
from .serializers import (
    AccessGroupSerializer,
    AccessRoleSerializer,
    ActivityResponseSerializer,
    AuditEventSerializer,
    BackupJobSerializer,
    ConfigurationDefinitionSerializer,
    ConfigurationVersionSerializer,
    CorrespondenceAccessGrantSerializer,
    CorrespondenceSearchResponseSerializer,
    CorrespondenceSerializer,
    DashboardResponseSerializer,
    DirectoryUserSerializer,
    DocumentUploadSerializer,
    DocumentUploadResponseSerializer,
    DocumentVersionSerializer,
    GenericListItemSerializer,
    HealthSerializer,
    IdentityProviderConfigurationSerializer,
    ListInstanceSerializer,
    ListInstanceLifecycleSerializer,
    ListInstanceRolloverSerializer,
    MeSerializer,
    NotificationSerializer,
    NumberingPreviewResponseSerializer,
    NumberingPreviewSerializer,
    OrganizationSettingsSerializer,
    OrganizationUnitSerializer,
    OperationalStatusSerializer,
    PublicConfigSerializer,
    SavedSearchSerializer,
    SignatureProofSerializer,
    SignatureRequestSerializer,
    TransferJobSerializer,
    TransitionSerializer,
    SystemSettingSerializer,
    UserPreferenceSerializer,
    WebhookEndpointSerializer,
    WorkflowTaskSerializer,
)
from .services import (
    assert_if_match,
    correspondence_queryset_for,
    preview_reference,
    record_audit,
    sign_correspondence,
    transition_correspondence,
)
from .tasks import create_backup, process_transfer_job, scan_document


def _dependency_status():
    cache_status = "ok"
    storage_status = "ok"
    try:
        redis.Redis.from_url(settings.CELERY_BROKER_URL, socket_connect_timeout=1, socket_timeout=1).ping()
    except (OSError, redis.RedisError):
        cache_status = "error"
    try:
        default_storage.exists(".numa-health")
    except Exception:  # Storage backends intentionally expose different exception types.
        storage_status = "error"
    return cache_status, storage_status


@extend_schema(responses=HealthSerializer)
@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        cursor.fetchone()
    cache_status, storage_status = _dependency_status()
    overall = "ok" if cache_status == storage_status == "ok" else "degraded"
    return Response({
        "status": overall,
        "database": "ok",
        "cache": cache_status,
        "storage": storage_status,
        "timestamp": timezone.now(),
        "version": settings.NUMA_VERSION,
    })


@extend_schema(responses=PublicConfigSerializer)
@api_view(["GET"])
@permission_classes([AllowAny])
def public_config(request):
    organization, _ = OrganizationSettings.objects.get_or_create(singleton=1)
    published_definitions = list(
        ConfigurationDefinition.objects.select_related("current_version").filter(
            slug__in=["correspondence-numbering", "main-navigation", "default-signature-policy"],
            active=True,
            current_version__state=ConfigurationVersion.State.PUBLISHED,
        )
    )
    published = {definition.slug: definition.current_version.data for definition in published_definitions}
    signature_version = next(
        (definition.current_version for definition in published_definitions if definition.slug == "default-signature-policy"),
        None,
    )
    signature_policy = published.get("default-signature-policy", {
        "internalValidationEnabled": True,
        "graphicSignatureEnabled": True,
        "digitalSignatureEnabled": False,
    })
    signature_runtime = signature_capabilities(signature_version)
    branding_extras = organization.settings.get("branding", {}) if isinstance(organization.settings, dict) else {}
    return Response({
        "version": settings.NUMA_VERSION,
        "organization": {
            "name": organization.organization_name,
            "application_name": organization.application_name,
            "primary_color": organization.primary_color,
            "accent_color": organization.accent_color,
            "logo_data_url": organization.logo_data_url or None,
            "favicon_data_url": organization.favicon_data_url or None,
            "footer_text": organization.footer_text,
            "default_home": organization.default_home,
            "locale": organization.locale,
            "timezone": organization.timezone,
            "row_version": organization.row_version,
            "logo_file_name": branding_extras.get("logoFileName"),
            "logo_mime_type": branding_extras.get("logoMimeType"),
            "banner_url": branding_extras.get("bannerUrl", ""),
            "font_family": branding_extras.get("fontFamily", "NUMA"),
        },
        "oidc": {
            "authority": settings.OIDC_PUBLIC_ISSUER,
            "client_id": settings.OIDC_WEB_CLIENT_ID,
        },
        "setup_required": not organization.configured,
        "uploads": {
            "max_bytes": settings.MAX_UPLOAD_SIZE,
            "allowed_types": sorted(settings.ALLOWED_UPLOAD_TYPES),
        },
        "numbering": published.get("correspondence-numbering", {}),
        "navigation": published.get("main-navigation", {}).get("entries", []),
        "signatures": {
            **signature_policy,
            "digitalSignatureAvailable": signature_runtime.digital,
            "digitalProvider": signature_runtime.digital_provider,
        },
    })


@extend_schema(request=OrganizationSettingsSerializer, responses=OrganizationSettingsSerializer)
@api_view(["POST"])
@permission_classes([AllowAny])
@transaction.atomic
def initial_setup(request):
    organization = OrganizationSettings.objects.select_for_update().get_or_create(singleton=1)[0]
    if organization.configured:
        raise StateConflict("Cette installation est déjà configurée.")
    supplied = request.headers.get("X-Setup-Token", "")
    if not settings.NUMA_SETUP_TOKEN or not hmac.compare_digest(supplied, settings.NUMA_SETUP_TOKEN):
        raise PermissionDenied("Jeton d’installation invalide.")
    if not request.user.is_authenticated:
        raise NotAuthenticated("Authentifiez le premier administrateur avant de terminer l’installation.")
    role = AccessRole.objects.get(slug="super-admin")
    profile = request.user.numa_profile
    profile.role_assignments.get_or_create(role=role, source="manual", defaults={"created_by": request.user})
    profile.roles = sorted(set(profile.roles or []) | {"super-admin"})
    profile.access_requested_at = None
    profile.save(update_fields=["roles", "access_requested_at"])
    serializer = OrganizationSettingsSerializer(organization, data=request.data, partial=True, context={"request": request})
    serializer.is_valid(raise_exception=True)
    organization = serializer.save()
    organization.configured = True
    organization.save(update_fields=["configured", "updated_at"])
    record_audit(actor=request.user, action="system.setup.completed", resource_type="organization_settings", resource_id=1, request=request)
    return Response(OrganizationSettingsSerializer(organization).data)


@extend_schema(responses=MeSerializer)
@api_view(["GET"])
def me(request):
    profile = request.user.numa_profile
    roles = sorted(effective_role_slugs(request.user))
    return Response({
        "id": request.user.id,
        "subject": profile.keycloak_subject,
        "email": request.user.email,
        "first_name": request.user.first_name,
        "last_name": request.user.last_name,
        "title": profile.title,
        "organization_unit": OrganizationUnitSerializer(profile.organization_unit).data if profile.organization_unit else None,
        "roles": roles,
        "capabilities": sorted(effective_capabilities(request.user)),
        "groups": [str(group_id) for group_id in profile.group_memberships.values_list("group_id", flat=True)],
        "access_pending": not bool(roles),
    })


@extend_schema(request=NumberingPreviewSerializer, responses=NumberingPreviewResponseSerializer)
@api_view(["POST"])
def numbering_preview(request):
    if not has_capability(request.user, Capability.CONFIGURATION_READ):
        raise PermissionDenied()
    serializer = NumberingPreviewSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    service = OrganizationUnit.objects.filter(code=data["service_code"], active=True).first()
    direction = OrganizationUnit.objects.filter(code=data["direction_code"], active=True).first()
    if service is None:
        raise ValidationError({"service_code": "Service actif introuvable."})
    if direction is None:
        raise ValidationError({"direction_code": "Direction active introuvable."})
    result = preview_reference(
        registry=data["registry"],
        service_code=service.code,
        direction_code=direction.code,
        received_at=data["received_at"],
        username=request.user.username,
        sequence=data.get("sequence"),
        numbering_settings=data.get("settings"),
    )
    return Response(result)


class OrganizationSettingsView(RetrieveUpdateAPIView):
    serializer_class = OrganizationSettingsSerializer
    permission_classes = [HasViewCapability]
    method_capabilities = {"GET": Capability.CONFIGURATION_READ, "PUT": Capability.SYSTEM_MANAGE, "PATCH": Capability.SYSTEM_MANAGE}

    def get_object(self):
        queryset = OrganizationSettings.objects
        if self.request.method in {"PUT", "PATCH"}:
            queryset = queryset.select_for_update()
        return queryset.get_or_create(singleton=1)[0]

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        row_version = getattr(response, "data", {}).get("row_version") if isinstance(getattr(response, "data", None), dict) else None
        if row_version is not None:
            response["ETag"] = f'"{row_version}"'
        return response


class UserPreferenceView(RetrieveUpdateAPIView):
    serializer_class = UserPreferenceSerializer

    def get_object(self):
        queryset = UserPreference.objects
        if self.request.method in {"PUT", "PATCH"}:
            queryset = queryset.select_for_update()
        organization = OrganizationSettings.objects.filter(singleton=1).first()
        defaults = {
            "locale": organization.locale if organization else "fr-FR",
            "timezone": organization.timezone if organization else "UTC",
            "default_home": organization.default_home if organization else "dashboard",
        }
        return queryset.get_or_create(user=self.request.user, defaults=defaults)[0]

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        row_version = getattr(response, "data", {}).get("row_version") if isinstance(getattr(response, "data", None), dict) else None
        if row_version is not None:
            response["ETag"] = f'"{row_version}"'
        return response


class SystemSettingViewSet(viewsets.ModelViewSet):
    queryset = SystemSetting.objects.all()
    serializer_class = SystemSettingSerializer
    permission_classes = [HasViewCapability]
    action_capabilities = {
        "list": Capability.CONFIGURATION_READ,
        "retrieve": Capability.CONFIGURATION_READ,
        "create": Capability.SYSTEM_MANAGE,
        "update": Capability.SYSTEM_MANAGE,
        "partial_update": Capability.SYSTEM_MANAGE,
    }
    http_method_names = ["get", "post", "put", "patch", "head", "options"]

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        row_version = getattr(response, "data", {}).get("row_version") if isinstance(getattr(response, "data", None), dict) else None
        if row_version is not None:
            response["ETag"] = f'"{row_version}"'
        return response


class OrganizationUnitViewSet(viewsets.ModelViewSet):
    queryset = OrganizationUnit.objects.select_related("parent").all()
    serializer_class = OrganizationUnitSerializer
    permission_classes = [HasViewCapability]
    action_capabilities = {
        "list": Capability.CORRESPONDENCE_READ,
        "retrieve": Capability.CORRESPONDENCE_READ,
        "create": Capability.IDENTITY_MANAGE,
        "update": Capability.IDENTITY_MANAGE,
        "partial_update": Capability.IDENTITY_MANAGE,
        "destroy": Capability.IDENTITY_MANAGE,
    }
    filterset_fields = ["active", "parent__code"]
    search_fields = ["code", "name"]
    ordering_fields = ["code", "name"]
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    def perform_destroy(self, instance):
        instance.active = False
        instance.save(update_fields=["active"])


class CorrespondenceViewSet(viewsets.ModelViewSet):
    queryset = Correspondence.objects.all()
    serializer_class = CorrespondenceSerializer
    permission_classes = [CorrespondencePermission]
    filterset_fields = ["registry", "status", "priority", "confidentiality", "direction__code", "responsible_service__code", "list_instance"]
    search_fields = ["reference", "subject", "sender", "origin_reference", "summary", "documents__extracted_text"]
    ordering_fields = ["received_at", "created_at", "updated_at", "priority", "reference", "due_at"]
    ordering = ["-received_at", "-created_at"]
    http_method_names = ["get", "post", "patch", "put", "head", "options"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return self.queryset.none()
        base = Correspondence.objects.select_related(
            "direction", "responsible_service", "created_by", "configuration_version", "list_instance"
        ).prefetch_related(
            "documents__created_by",
            "files__versions__created_by",
            "workflow_events__actor",
            "signature_proofs__signer",
        ).annotate(attachment_count=Count("files", distinct=True))
        queryset = correspondence_queryset_for(self.request.user, base)
        statuses = [value for value in self.request.query_params.get("statuses", "").split(",") if value]
        if statuses:
            queryset = queryset.filter(status__in=statuses)
        if self.request.query_params.get("mine") == "true":
            queryset = queryset.filter(created_by=self.request.user)
        if self.request.query_params.get("received_from"):
            queryset = queryset.filter(received_at__gte=self.request.query_params["received_from"])
        if self.request.query_params.get("received_to"):
            queryset = queryset.filter(received_at__lte=self.request.query_params["received_to"])
        return queryset

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        if isinstance(getattr(response, "data", None), dict) and response.data.get("row_version") is not None:
            response["ETag"] = f'"{response.data["row_version"]}"'
        return response

    @extend_schema(request=DocumentUploadSerializer, responses={201: DocumentUploadResponseSerializer})
    @action(detail=True, methods=["post"], url_path="documents", parser_classes=[MultiPartParser, FormParser])
    def create_document(self, request, pk=None):
        correspondence = self.get_object()
        if correspondence.status not in {Correspondence.Status.DRAFT, Correspondence.Status.TO_PROCESS}:
            raise StateConflict("Les documents ne peuvent être ajoutés que pendant la préparation du courrier.")
        serializer = DocumentUploadSerializer(data=request.data, context={"request": request, "correspondence": correspondence})
        serializer.is_valid(raise_exception=True)
        document = serializer.save()
        scan_document.delay(str(document.id))
        correspondence.refresh_from_db(fields=["row_version"])
        return Response({
            "document": DocumentVersionSerializer(document, context={"request": request}).data,
            "row_version": correspondence.row_version,
            "etag": f'"{correspondence.row_version}"',
        }, status=status.HTTP_201_CREATED)

    def _transition(self, request, action_name):
        serializer = TransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = transition_correspondence(
            self.get_object(),
            action_name,
            request.user,
            request=request,
            comment=serializer.validated_data.get("comment", ""),
        )
        item = self.get_queryset().get(pk=item.pk)
        return Response(self.get_serializer(item).data)

    @extend_schema(request=TransitionSerializer, responses=CorrespondenceSerializer)
    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        return self._transition(request, "submit")

    @extend_schema(request=TransitionSerializer, responses=CorrespondenceSerializer)
    @action(detail=True, methods=["post"])
    def validate(self, request, pk=None):
        return self._transition(request, "validate")

    @extend_schema(request=TransitionSerializer, responses=CorrespondenceSerializer)
    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        return self._transition(request, "reject")

    @extend_schema(request=TransitionSerializer, responses=CorrespondenceSerializer)
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        return self._transition(request, "cancel")

    @extend_schema(request=TransitionSerializer, responses=CorrespondenceSerializer)
    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None):
        return self._transition(request, "reopen")

    @extend_schema(request=TransitionSerializer, responses=CorrespondenceSerializer)
    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        return self._transition(request, "archive")

    @extend_schema(request=SignatureRequestSerializer, responses=CorrespondenceSerializer)
    @action(detail=True, methods=["post"])
    def sign(self, request, pk=None):
        serializer = SignatureRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        correspondence = self.get_object()
        document_version = DocumentVersion.objects.filter(
            pk=serializer.validated_data["document_version_id"], correspondence=correspondence
        ).first()
        if document_version is None:
            raise ValidationError({"document_version_id": "Version documentaire introuvable."})
        item, proof = sign_correspondence(
            correspondence,
            request.user,
            document_version,
            serializer.validated_data["level"],
            request=request,
            graphic_mark=serializer.validated_data.get("graphic_mark", ""),
        )
        data = self.get_serializer(self.get_queryset().get(pk=item.pk)).data
        data["signature_proof"] = SignatureProofSerializer(proof).data
        return Response(data)

    @action(detail=True, methods=["get"], url_path=r"documents/(?P<document_id>[0-9a-f-]+)/download")
    def download_document(self, request, pk=None, document_id=None):
        correspondence = self.get_object()
        document = correspondence.documents.filter(pk=document_id).first()
        if document is None:
            return Response({"code": "not_found", "detail": "Document introuvable.", "errors": None}, status=status.HTTP_404_NOT_FOUND)
        if document.scan_status != document.ScanStatus.CLEAN:
            raise StateConflict("Le document n’est pas disponible avant validation antivirus.")
        record_audit(actor=request.user, action="document.downloaded", resource_type="document", resource_id=document.document_id or document.id, request=request, metadata={"version_id": str(document.id), "sha256": document.sha256})
        return FileResponse(document.file.open("rb"), as_attachment=True, filename=document.filename, content_type=document.detected_mime_type or document.mime_type)

    @action(detail=True, methods=["get", "put"], url_path="access-grants")
    @transaction.atomic
    def access_grants(self, request, pk=None):
        correspondence = self.get_object()
        if request.method == "GET":
            grants = correspondence.access_grants.select_related("user", "group")
            return Response(CorrespondenceAccessGrantSerializer(grants, many=True).data)
        locked = Correspondence.objects.select_for_update().get(pk=correspondence.pk)
        assert_if_match(request, locked)
        serializer = CorrespondenceAccessGrantSerializer(data=request.data, many=True)
        serializer.is_valid(raise_exception=True)
        locked.access_grants.filter(source=CorrespondenceAccessGrant.Source.MANUAL).delete()
        created = []
        for data in serializer.validated_data:
            created.append(CorrespondenceAccessGrant.objects.create(
                correspondence=locked,
                source=CorrespondenceAccessGrant.Source.MANUAL,
                created_by=request.user,
                **data,
            ))
        locked.row_version += 1
        locked.save(update_fields=["row_version", "updated_at"])
        record_audit(actor=request.user, action="correspondence.acl.replaced", resource_type="correspondence", resource_id=locked.id, request=request, metadata={"manual_grant_count": len(created)})
        grants = locked.access_grants.select_related("user", "group")
        return Response({"row_version": locked.row_version, "grants": CorrespondenceAccessGrantSerializer(grants, many=True).data})


class DirectoryUserViewSet(viewsets.ModelViewSet):
    queryset = UserProfile.objects.select_related("user", "organization_unit").prefetch_related("role_assignments__role", "group_memberships__group")
    serializer_class = DirectoryUserSerializer
    permission_classes = [HasViewCapability]
    action_capabilities = {"list": Capability.IDENTITY_READ, "retrieve": Capability.IDENTITY_READ, "directory_candidates": Capability.IDENTITY_MANAGE, "create": Capability.IDENTITY_MANAGE, "update": Capability.IDENTITY_MANAGE, "partial_update": Capability.IDENTITY_MANAGE, "destroy": Capability.IDENTITY_MANAGE}
    filterset_fields = ["active", "organization_unit__code"]
    search_fields = ["user__first_name", "user__last_name", "user__email", "title"]
    ordering_fields = ["user__last_name", "last_seen_at"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    @action(detail=False, methods=["get"], url_path="directory-candidates")
    def directory_candidates(self, request):
        try:
            candidates = KeycloakAdmin().users(request.query_params.get("q", "").strip())
        except IdentityProviderError as exc:
            raise ValidationError({"keycloak": str(exc)}) from exc
        existing_subjects = set(UserProfile.objects.values_list("keycloak_subject", flat=True))
        return Response({"results": [item for item in candidates if item["subject"] not in existing_subjects]})

    def perform_destroy(self, instance):
        if instance.user_id == self.request.user.id:
            raise ValidationError("Vous ne pouvez pas désactiver votre propre compte.")
        instance.active = False
        instance.user.is_active = False
        instance.user.save(update_fields=["is_active"])
        instance.save(update_fields=["active"])


class AccessRoleViewSet(viewsets.ModelViewSet):
    queryset = AccessRole.objects.all()
    serializer_class = AccessRoleSerializer
    permission_classes = [HasViewCapability]
    action_capabilities = {"list": Capability.IDENTITY_READ, "retrieve": Capability.IDENTITY_READ, "create": Capability.IDENTITY_MANAGE, "update": Capability.IDENTITY_MANAGE, "partial_update": Capability.IDENTITY_MANAGE, "destroy": Capability.IDENTITY_MANAGE}
    search_fields = ["slug", "label", "description"]

    def perform_destroy(self, instance):
        if instance.protected:
            raise StateConflict("Ce rôle système ne peut pas être supprimé.")
        if instance.user_assignments.exists() or instance.groups.exists():
            instance.active = False
            instance.save(update_fields=["active", "updated_at"])
        else:
            instance.delete()

    def perform_update(self, serializer):
        before = AccessRoleSerializer(serializer.instance).data
        instance = serializer.save()
        record_audit(actor=self.request.user, action="identity.role.updated", resource_type="role", resource_id=instance.slug, request=self.request, before=before, after=AccessRoleSerializer(instance).data)


class AccessGroupViewSet(viewsets.ModelViewSet):
    queryset = AccessGroup.objects.select_related("organization_unit").prefetch_related("roles", "memberships")
    serializer_class = AccessGroupSerializer
    permission_classes = [HasViewCapability]
    action_capabilities = {"list": Capability.IDENTITY_READ, "retrieve": Capability.IDENTITY_READ, "create": Capability.IDENTITY_MANAGE, "update": Capability.IDENTITY_MANAGE, "partial_update": Capability.IDENTITY_MANAGE, "destroy": Capability.IDENTITY_MANAGE}
    filterset_fields = ["source", "active", "organization_unit"]
    search_fields = ["name", "description", "external_id"]

    def perform_destroy(self, instance):
        if instance.source == AccessGroup.Source.DIRECTORY:
            raise StateConflict("Un groupe synchronisé doit être retiré depuis l’annuaire.")
        instance.active = False
        instance.save(update_fields=["active", "updated_at"])


class IdentityProviderConfigurationViewSet(viewsets.ModelViewSet):
    queryset = IdentityProviderConfiguration.objects.select_related("created_by", "updated_by")
    serializer_class = IdentityProviderConfigurationSerializer
    permission_classes = [HasViewCapability]
    action_capabilities = {
        "list": Capability.IDENTITY_READ,
        "retrieve": Capability.IDENTITY_READ,
        "create": Capability.IDENTITY_MANAGE,
        "update": Capability.IDENTITY_MANAGE,
        "partial_update": Capability.IDENTITY_MANAGE,
        "destroy": Capability.IDENTITY_MANAGE,
        "test": Capability.IDENTITY_MANAGE,
        "apply": Capability.IDENTITY_MANAGE,
    }
    filterset_fields = ["provider", "enabled", "status"]
    search_fields = ["alias", "display_name"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def _config(self, instance):
        try:
            return json.loads(decrypt_secret(instance.config_encrypted))
        except (ValueError, json.JSONDecodeError) as exc:
            raise StateConflict("La configuration chiffrée ne peut pas être lue avec la clé de cette installation.") from exc

    @action(detail=True, methods=["post"])
    def test(self, request, pk=None):
        instance = self.get_object()
        try:
            result = test_identity_provider(instance.provider, self._config(instance))
        except IdentityProviderError as exc:
            instance.status = IdentityProviderConfiguration.Status.ERROR
            instance.last_error = str(exc)[:2000]
            instance.last_tested_at = timezone.now()
            instance.updated_by = request.user
            instance.save(update_fields=["status", "last_error", "last_tested_at", "updated_by", "updated_at"])
            record_audit(actor=request.user, action="identity.provider.test.failed", resource_type="identity_provider", resource_id=instance.id, request=request, metadata={"error": instance.last_error})
            raise ValidationError({"connection": str(exc)}) from exc
        instance.status = IdentityProviderConfiguration.Status.READY
        instance.last_error = ""
        instance.last_tested_at = timezone.now()
        instance.updated_by = request.user
        instance.save(update_fields=["status", "last_error", "last_tested_at", "updated_by", "updated_at"])
        record_audit(actor=request.user, action="identity.provider.test.succeeded", resource_type="identity_provider", resource_id=instance.id, request=request)
        return Response({"status": "ready", "result": result, "provider": self.get_serializer(instance).data})

    @action(detail=True, methods=["post"])
    def apply(self, request, pk=None):
        instance = self.get_object()
        config = self._config(instance)
        try:
            test_identity_provider(instance.provider, config)
            resource_id = KeycloakAdmin().upsert(
                alias=instance.alias,
                display_name=instance.display_name,
                provider=instance.provider,
                enabled=instance.enabled,
                config=config,
                resource_id=instance.keycloak_resource_id,
            )
        except IdentityProviderError as exc:
            instance.status = IdentityProviderConfiguration.Status.ERROR
            instance.last_error = str(exc)[:2000]
            instance.last_tested_at = timezone.now()
            instance.updated_by = request.user
            instance.save(update_fields=["status", "last_error", "last_tested_at", "updated_by", "updated_at"])
            record_audit(actor=request.user, action="identity.provider.apply.failed", resource_type="identity_provider", resource_id=instance.id, request=request, metadata={"error": instance.last_error})
            raise ValidationError({"keycloak": str(exc)}) from exc
        instance.keycloak_resource_id = resource_id
        instance.status = IdentityProviderConfiguration.Status.READY
        instance.last_error = ""
        instance.last_tested_at = timezone.now()
        instance.updated_by = request.user
        instance.save(update_fields=["keycloak_resource_id", "status", "last_error", "last_tested_at", "updated_by", "updated_at"])
        record_audit(actor=request.user, action="identity.provider.applied", resource_type="identity_provider", resource_id=instance.id, request=request, metadata={"keycloak_resource_id": resource_id, "enabled": instance.enabled})
        return Response(self.get_serializer(instance).data)

    def perform_destroy(self, instance):
        try:
            KeycloakAdmin().delete(provider=instance.provider, alias=instance.alias, resource_id=instance.keycloak_resource_id)
        except IdentityProviderError as exc:
            raise ValidationError({"keycloak": str(exc)}) from exc
        record_audit(actor=self.request.user, action="identity.provider.deleted", resource_type="identity_provider", resource_id=instance.id, request=self.request, before={"alias": instance.alias, "provider": instance.provider})
        instance.delete()


class ConfigurationDefinitionViewSet(viewsets.ModelViewSet):
    queryset = ConfigurationDefinition.objects.select_related("current_version").prefetch_related("versions")
    serializer_class = ConfigurationDefinitionSerializer
    permission_classes = [HasViewCapability]
    action_capabilities = {
        "list": Capability.CONFIGURATION_READ,
        "retrieve": Capability.CONFIGURATION_READ,
        "versions": Capability.CONFIGURATION_READ,
        "validate": Capability.CONFIGURATION_MANAGE,
        "create": Capability.CONFIGURATION_MANAGE,
        "update": Capability.CONFIGURATION_MANAGE,
        "partial_update": Capability.CONFIGURATION_MANAGE,
        "destroy": Capability.CONFIGURATION_MANAGE,
        "publish": Capability.CONFIGURATION_PUBLISH,
        "rollback": Capability.CONFIGURATION_PUBLISH,
    }
    filterset_fields = ["kind", "active"]
    search_fields = ["slug", "name", "description"]
    ordering_fields = ["kind", "name", "updated_at"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    @action(detail=True, methods=["get"])
    def versions(self, request, pk=None):
        versions = self.get_object().versions.all()
        return Response(ConfigurationVersionSerializer(versions, many=True).data)

    def _compile_latest(self, definition, version):
        compiled = compile_configuration(definition.kind, version.data, version.schema_version)
        errors = list(compiled.errors)
        for dependency in compiled.dependencies:
            exists = ConfigurationDefinition.objects.filter(
                kind=dependency["kind"],
                slug=dependency["slug"],
                active=True,
                current_version__state=ConfigurationVersion.State.PUBLISHED,
            ).exists()
            if not exists:
                errors.append({
                    "path": f"bindings.{dependency['role']}",
                    "message": f"La configuration publiée « {dependency['kind']}:{dependency['slug']} » est introuvable.",
                })
        return compiled, errors

    @action(detail=True, methods=["post"])
    def validate(self, request, pk=None):
        definition = self.get_object()
        version = definition.versions.order_by("-version").first()
        if version is None:
            raise StateConflict("Aucune version n’est disponible.")
        compiled, errors = self._compile_latest(definition, version)
        return Response({
            "valid": not errors,
            "schema_version": version.schema_version,
            "compiled_data": compiled.data,
            "dependencies": compiled.dependencies,
            "content_hash": compiled.content_hash,
            "validation_errors": errors,
        })

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def publish(self, request, pk=None):
        definition = ConfigurationDefinition.objects.select_for_update().get(pk=self.get_object().pk)
        version = definition.versions.order_by("-version").first()
        if version is None:
            raise StateConflict("Aucune version n’est disponible.")
        expected = request.headers.get("If-Match")
        if expected is None:
            raise PreconditionRequired("La version à publier doit être fournie avec If-Match.")
        if expected.strip().removeprefix("W/").strip('"') != str(version.version):
            raise StaleVersion("Une version plus récente existe.")
        compiled, errors = self._compile_latest(definition, version)
        if errors:
            version.validation_errors = errors
            version.save(update_fields=["validation_errors"])
            raise ValidationError({"configuration": errors})
        if version.state != ConfigurationVersion.State.DRAFT:
            raise StateConflict("Seul un brouillon peut être publié.")
        previous = definition.current_version
        if previous and previous.pk != version.pk and previous.state == ConfigurationVersion.State.PUBLISHED:
            previous.state = ConfigurationVersion.State.ARCHIVED
            previous.save(update_fields=["state"])
        version.state = ConfigurationVersion.State.PUBLISHED
        version.compiled_data = compiled.data
        version.dependencies = compiled.dependencies
        version.content_hash = compiled.content_hash
        version.validation_errors = []
        version.published_by = request.user
        version.published_at = timezone.now()
        version.save(update_fields=["state", "compiled_data", "dependencies", "content_hash", "validation_errors", "published_by", "published_at"])
        definition.current_version = version
        definition.save(update_fields=["current_version", "updated_at"])
        record_audit(actor=request.user, action="configuration.published", resource_type="configuration", resource_id=definition.id, request=request, metadata={"version": version.version})
        return Response(self.get_serializer(self.get_queryset().get(pk=definition.pk)).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def rollback(self, request, pk=None):
        definition = ConfigurationDefinition.objects.select_for_update().get(pk=self.get_object().pk)
        source_number = request.data.get("version")
        source = definition.versions.filter(
            version=source_number,
            state__in=[ConfigurationVersion.State.PUBLISHED, ConfigurationVersion.State.ARCHIVED],
        ).first()
        if source is None:
            raise ValidationError({"version": "Version publiée introuvable."})
        latest = definition.versions.order_by("-version").first()
        expected = request.headers.get("If-Match")
        if expected is None:
            raise PreconditionRequired()
        if expected.strip().removeprefix("W/").strip('"') != str(latest.version):
            raise StaleVersion()
        draft = ConfigurationVersion.objects.create(
            definition=definition,
            version=latest.version + 1,
            state=ConfigurationVersion.State.DRAFT,
            data=source.data,
            schema_version=source.schema_version,
            compiled_data=source.compiled_data,
            dependencies=source.dependencies,
            content_hash=source.content_hash,
            validation_errors=source.validation_errors,
            created_by=request.user,
        )
        record_audit(actor=request.user, action="configuration.rollback.prepared", resource_type="configuration", resource_id=definition.id, request=request, metadata={"source_version": source.version, "draft_version": draft.version})
        return Response(ConfigurationVersionSerializer(draft).data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        instance.active = False
        instance.save(update_fields=["active", "updated_at"])


class WorkflowTaskViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = WorkflowTask.objects.select_related(
        "workflow__correspondence__created_by", "assignee", "assignee_group"
    )
    serializer_class = WorkflowTaskSerializer
    permission_classes = [HasViewCapability]
    action_capabilities = {"list": Capability.TASK_READ, "retrieve": Capability.TASK_READ, "act": Capability.TASK_ACT, "assign": Capability.TASK_ASSIGN}
    filterset_fields = ["status", "kind"]
    ordering_fields = ["due_at", "created_at", "status"]

    def get_queryset(self):
        queryset = super().get_queryset()
        if has_capability(self.request.user, Capability.TASK_ASSIGN):
            return queryset
        profile = self.request.user.numa_profile
        group_ids = profile.group_memberships.values_list("group_id", flat=True)
        return queryset.filter(Q(assignee=self.request.user) | Q(assignee_group_id__in=group_ids))

    @action(detail=True, methods=["post"])
    def act(self, request, pk=None):
        task = self.get_object()
        action_name = request.data.get("action")
        if action_name not in {"validate", "reject"}:
            raise ValidationError({"action": "Choisissez validate ou reject."})
        item = transition_correspondence(task.workflow.correspondence, action_name, request.user, request=request, comment=request.data.get("comment", ""))
        return Response(CorrespondenceSerializer(item, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        task = self.get_object()
        user_id = request.data.get("user_id")
        profile = UserProfile.objects.select_related("user").filter(user_id=user_id, active=True, user__is_active=True).first()
        if profile is None:
            raise ValidationError({"user_id": "Utilisateur actif introuvable."})
        before = {"assignee_id": task.assignee_id, "assignee_group_id": str(task.assignee_group_id or "")}
        task.assignee = profile.user
        task.assignee_group = None
        task.save(update_fields=["assignee", "assignee_group"])
        record_audit(actor=request.user, action="workflow.task.assigned", resource_type="workflow_task", resource_id=task.id, request=request, metadata={"reason": request.data.get("reason", "")}, before=before, after={"assignee_id": task.assignee_id, "assignee_group_id": None})
        return Response(self.get_serializer(task).data)


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [HasViewCapability]
    action_capabilities = {"list": Capability.NOTIFICATION_READ, "retrieve": Capability.NOTIFICATION_READ, "read": Capability.NOTIFICATION_READ, "read_all": Capability.NOTIFICATION_READ}
    filterset_fields = ["kind"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Notification.objects.none()
        return Notification.objects.filter(recipient=self.request.user)

    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        item = self.get_object()
        if item.read_at is None:
            item.read_at = timezone.now()
            item.save(update_fields=["read_at"])
        return Response(self.get_serializer(item).data)

    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        count = self.get_queryset().filter(read_at__isnull=True).update(read_at=timezone.now())
        return Response({"updated": count})


class AuditEventViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditEvent.objects.select_related("actor")
    serializer_class = AuditEventSerializer
    permission_classes = [HasViewCapability]
    action_capabilities = {"list": Capability.AUDIT_READ, "retrieve": Capability.AUDIT_READ, "verify": Capability.AUDIT_READ}
    filterset_fields = ["action", "resource_type", "resource_id", "actor"]
    search_fields = ["action", "resource_type", "resource_id", "actor_snapshot"]
    ordering_fields = ["sequence", "created_at"]

    @action(detail=False, methods=["get"])
    def verify(self, request):
        previous = ""
        count = 0
        expected_sequence = 1
        for event in AuditEvent.objects.order_by("sequence").iterator():
            if event.sequence != expected_sequence:
                return Response({
                    "valid": False,
                    "checked": count,
                    "invalid_event_id": str(event.id),
                    "reason": "sequence_gap",
                })
            payload = event._canonical_payload()
            payload["previous_hash"] = previous
            canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
            expected = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
            if event.previous_hash != previous or not hmac.compare_digest(event.event_hash, expected):
                return Response({
                    "valid": False,
                    "checked": count,
                    "invalid_event_id": str(event.id),
                    "reason": "hash_mismatch",
                })
            previous = event.event_hash
            count += 1
            expected_sequence += 1
        head = AuditHead.objects.filter(singleton=1).first()
        if head is None or head.event_hash != previous or head.next_sequence != expected_sequence:
            return Response({"valid": False, "checked": count, "reason": "head_mismatch"})
        return Response({"valid": True, "checked": count, "head": previous, "next_sequence": expected_sequence})


class SavedSearchViewSet(viewsets.ModelViewSet):
    serializer_class = SavedSearchSerializer
    permission_classes = [HasViewCapability]
    action_capabilities = {"list": Capability.SEARCH_USE, "retrieve": Capability.SEARCH_USE, "create": Capability.SEARCH_USE, "update": Capability.SEARCH_USE, "partial_update": Capability.SEARCH_USE, "destroy": Capability.SEARCH_USE}

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return SavedSearch.objects.none()
        return SavedSearch.objects.filter(Q(owner=self.request.user) | Q(shared=True))


@extend_schema(responses=CorrespondenceSearchResponseSerializer)
@api_view(["GET"])
def global_search(request):
    if not has_capability(request.user, Capability.SEARCH_USE):
        raise PermissionDenied()
    query = request.query_params.get("q", "").strip()
    if len(query) < 2:
        raise ValidationError({"q": "Saisissez au moins deux caractères."})
    correspondences = correspondence_queryset_for(
        request.user,
        Correspondence.objects.select_related("direction", "responsible_service", "created_by").annotate(attachment_count=Count("files", distinct=True)),
    )
    resource_type = request.query_params.get("type", "all")
    if resource_type in {Correspondence.Registry.INTERNAL, Correspondence.Registry.EXTERNAL}:
        correspondences = correspondences.filter(registry=resource_type)
    elif resource_type == "documents":
        correspondences = correspondences.filter(documents__isnull=False)
    status_filter = request.query_params.get("status")
    if status_filter:
        correspondences = correspondences.filter(status=status_filter)
    received_from = request.query_params.get("from")
    if received_from:
        correspondences = correspondences.filter(received_at__gte=received_from)
    correspondences = correspondences.filter(
        Q(reference__icontains=query)
        | Q(subject__icontains=query)
        | Q(sender__icontains=query)
        | Q(origin_reference__icontains=query)
        | Q(summary__icontains=query)
        | Q(documents__extracted_text__icontains=query)
    ).distinct()
    total = correspondences.count()
    return Response({"query": query, "count": total, "truncated": total > 100, "results": CorrespondenceSerializer(correspondences[:100], many=True, context={"request": request}).data})


@extend_schema(responses=DashboardResponseSerializer)
@api_view(["GET"])
def dashboard(request):
    queryset = correspondence_queryset_for(request.user)
    period = request.query_params.get("period", "12m")
    if period not in {"7d", "4w", "12m"}:
        raise ValidationError({"period": "Choisissez 7d, 4w ou 12m."})
    counts = {row["status"]: row["total"] for row in queryset.values("status").annotate(total=Count("id"))}
    overdue = queryset.exclude(status__in=[Correspondence.Status.VALIDATED, Correspondence.Status.SIGNED, Correspondence.Status.ARCHIVED, Correspondence.Status.CANCELLED]).filter(due_at__lt=timezone.localdate()).count()
    recent = queryset.select_related("direction", "responsible_service", "created_by").annotate(attachment_count=Count("files", distinct=True))[:8]
    profile = request.user.numa_profile
    group_ids = profile.group_memberships.values_list("group_id", flat=True)
    tasks = WorkflowTask.objects.select_related("workflow__correspondence__created_by", "assignee", "assignee_group").filter(
        Q(assignee=request.user) | Q(assignee_group_id__in=group_ids)
    )[:8]
    activity = WorkflowEvent.objects.select_related("actor", "correspondence").filter(correspondence__in=queryset).order_by("-created_at")[:8]
    today = timezone.localdate()
    if period == "7d":
        start = today - timedelta(days=6)
        buckets = [start + timedelta(days=index) for index in range(7)]
        truncation = TruncDay("received_at")
        key_format = "%Y-%m-%d"
    elif period == "4w":
        current_week = today - timedelta(days=today.weekday())
        start = current_week - timedelta(weeks=3)
        buckets = [start + timedelta(weeks=index) for index in range(4)]
        truncation = TruncWeek("received_at")
        key_format = "%Y-%m-%d"
    else:
        month_index = today.year * 12 + today.month - 1 - 11
        buckets = [date((month_index + index) // 12, (month_index + index) % 12 + 1, 1) for index in range(12)]
        start = buckets[0]
        truncation = TruncMonth("received_at")
        key_format = "%Y-%m"
    series = {
        bucket.strftime(key_format): {
            "key": bucket.strftime(key_format),
            "label": bucket.strftime(key_format),
            "month": bucket.strftime(key_format),
            "internal": 0,
            "external": 0,
        }
        for bucket in buckets
    }
    rows = queryset.filter(received_at__gte=start).annotate(bucket=truncation).values("bucket", "registry").annotate(total=Count("id")).order_by("bucket")
    for row in rows:
        key = row["bucket"].strftime(key_format)
        if key in series:
            series[key][row["registry"]] = row["total"]
    return Response({
        "period": period,
        "metrics": {
            "total": queryset.count(),
            "to_process": counts.get(Correspondence.Status.TO_PROCESS, 0),
            "in_validation": counts.get(Correspondence.Status.IN_VALIDATION, 0),
            "validated": counts.get(Correspondence.Status.VALIDATED, 0),
            "overdue": overdue,
        },
        "recent": CorrespondenceSerializer(recent, many=True, context={"request": request}).data,
        "tasks": WorkflowTaskSerializer(tasks, many=True).data,
        "activity": [{
            "id": str(event.id), "event": event.event, "reference": event.correspondence.reference,
            "subject": event.correspondence.subject, "actor": event.actor.get_full_name() or event.actor.username,
            "from_status": event.from_status, "to_status": event.to_status, "comment": event.comment,
            "created_at": event.created_at,
        } for event in activity],
        "series": list(series.values()),
        "registries": {
            "internal": queryset.filter(registry=Correspondence.Registry.INTERNAL).count(),
            "external": queryset.filter(registry=Correspondence.Registry.EXTERNAL).count(),
        },
    })


@extend_schema(responses=ActivityResponseSerializer)
@api_view(["GET"])
def activity(request):
    if not has_capability(request.user, Capability.CORRESPONDENCE_READ):
        raise PermissionDenied()
    scoped = correspondence_queryset_for(request.user).values("id")
    events = WorkflowEvent.objects.select_related("actor", "correspondence").filter(correspondence_id__in=scoped).order_by("-created_at")
    event_name = request.query_params.get("event")
    if event_name:
        events = events.filter(event=event_name)
    values = [{
        "id": str(event.id), "event": event.event, "reference": event.correspondence.reference,
        "correspondence_id": str(event.correspondence_id), "registry": event.correspondence.registry,
        "subject": event.correspondence.subject, "actor": event.actor.get_full_name() or event.actor.username,
        "from_status": event.from_status, "to_status": event.to_status, "comment": event.comment,
        "metadata": event.metadata, "created_at": event.created_at,
    } for event in events[:100]]
    return Response({"count": events.count(), "results": values})


class TransferJobViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = TransferJob.objects.all()
    serializer_class = TransferJobSerializer
    permission_classes = [HasViewCapability]
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        queryset = super().get_queryset()
        if has_capability(self.request.user, Capability.SYSTEM_MANAGE):
            return queryset
        return queryset.filter(created_by=self.request.user)

    def get_permissions(self):
        if self.action == "create":
            kind = self.request.data.get("kind")
            self.action_capabilities = {"create": Capability.TRANSFER_IMPORT if kind == TransferJob.Kind.IMPORT else Capability.TRANSFER_EXPORT}
        else:
            self.action_capabilities = {"list": Capability.TRANSFER_EXPORT, "retrieve": Capability.TRANSFER_EXPORT, "download": Capability.TRANSFER_EXPORT}
        return super().get_permissions()

    def perform_create(self, serializer):
        job = serializer.save()
        process_transfer_job.delay(str(job.id))

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        job = self.get_object()
        if job.status != TransferJob.Status.COMPLETE or not job.result_file:
            raise StateConflict("Le fichier d’export n’est pas encore disponible.")
        return FileResponse(job.result_file.open("rb"), as_attachment=True, filename=Path(job.result_file.name).name)


class BackupJobViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = BackupJob.objects.all()
    serializer_class = BackupJobSerializer
    permission_classes = [HasViewCapability]
    action_capabilities = {action: Capability.BACKUP_MANAGE for action in ["create", "list", "retrieve", "verify", "download"]}

    def perform_create(self, serializer):
        job = serializer.save()
        create_backup.delay(str(job.id))

    def _local_path(self, job):
        location = next((value.removeprefix("local:") for value in job.location.split(";") if value.startswith("local:")), "")
        if not location:
            raise StateConflict("Cette sauvegarde ne possède pas de copie locale.")
        path = Path(location).resolve()
        backup_root = Path(settings.NUMA_BACKUP_DIR).resolve()
        if backup_root not in path.parents or not path.is_file():
            raise StateConflict("Le fichier local de sauvegarde est introuvable.")
        return path

    @action(detail=True, methods=["post"])
    def verify(self, request, pk=None):
        job = self.get_object()
        if job.status != BackupJob.Status.COMPLETE:
            raise StateConflict("La sauvegarde n’est pas terminée.")
        result = verify_encrypted_bundle(self._local_path(job))
        if not hmac.compare_digest(result["sha256"], job.checksum):
            raise StateConflict("Le checksum de la sauvegarde ne correspond plus au journal.")
        record_audit(actor=request.user, action="backup.verified", resource_type="backup_job", resource_id=job.id, request=request, metadata=result)
        return Response(result)

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        job = self.get_object()
        if job.status != BackupJob.Status.COMPLETE:
            raise StateConflict("La sauvegarde n’est pas terminée.")
        path = self._local_path(job)
        record_audit(actor=request.user, action="backup.downloaded", resource_type="backup_job", resource_id=job.id, request=request)
        return FileResponse(path.open("rb"), as_attachment=True, filename=path.name)


class WebhookEndpointViewSet(viewsets.ModelViewSet):
    queryset = WebhookEndpoint.objects.all()
    serializer_class = WebhookEndpointSerializer
    permission_classes = [HasViewCapability]
    action_capabilities = {action: Capability.INTEGRATION_MANAGE for action in ["list", "retrieve", "create", "update", "partial_update", "destroy"]}


class ListInstanceViewSet(viewsets.ModelViewSet):
    queryset = ListInstance.objects.select_related("definition", "configuration_version").annotate(item_count=Count("correspondences"))
    serializer_class = ListInstanceSerializer
    permission_classes = [HasViewCapability]
    action_capabilities = {
        "list": Capability.CONFIGURATION_READ,
        "retrieve": Capability.CONFIGURATION_READ,
        "create": Capability.CONFIGURATION_MANAGE,
        "update": Capability.CONFIGURATION_MANAGE,
        "partial_update": Capability.CONFIGURATION_MANAGE,
        "activate": Capability.CONFIGURATION_PUBLISH,
        "close": Capability.CONFIGURATION_PUBLISH,
        "reopen": Capability.CONFIGURATION_PUBLISH,
        "archive": Capability.CONFIGURATION_PUBLISH,
        "rollover": Capability.CONFIGURATION_MANAGE,
    }
    filterset_fields = ["definition", "status", "period_key"]
    ordering_fields = ["period_key", "created_at", "updated_at"]
    http_method_names = ["get", "post", "put", "patch", "head", "options"]

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        row_version = getattr(response, "data", {}).get("row_version") if isinstance(getattr(response, "data", None), dict) else None
        if row_version is not None:
            response["ETag"] = f'"{row_version}"'
        return response

    def perform_create(self, serializer):
        instance = serializer.save()
        record_audit(
            actor=self.request.user,
            action="list_instance.created",
            resource_type="list_instance",
            resource_id=instance.id,
            request=self.request,
            after=self.get_serializer(instance).data,
        )

    @transaction.atomic
    def perform_update(self, serializer):
        before = self.get_serializer(serializer.instance).data
        instance = serializer.save()
        record_audit(
            actor=self.request.user,
            action="list_instance.updated",
            resource_type="list_instance",
            resource_id=instance.id,
            request=self.request,
            before=before,
            after=self.get_serializer(instance).data,
        )

    def _lifecycle(self, request, target, allowed_from):
        payload = ListInstanceLifecycleSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        item = ListInstance.objects.select_for_update().select_related("definition", "configuration_version").get(pk=self.get_object().pk)
        assert_if_match(request, item)
        if item.status not in allowed_from:
            raise StateConflict(f"L’instance ne peut pas passer de « {item.get_status_display()} » à « {target.label} ».")
        reason = payload.validated_data.get("reason", "").strip()
        if target in {ListInstance.Status.CLOSED, ListInstance.Status.REOPENED, ListInstance.Status.ARCHIVED} and not reason:
            raise ValidationError({"reason": "Une justification est obligatoire."})
        if target in {ListInstance.Status.ACTIVE, ListInstance.Status.REOPENED}:
            conflict = ListInstance.objects.filter(
                definition=item.definition,
                status__in=[ListInstance.Status.ACTIVE, ListInstance.Status.REOPENED],
            ).exclude(pk=item.pk).exists()
            if conflict:
                raise StateConflict("Une autre instance de cette liste est déjà active.")
        before = self.get_serializer(item).data
        now = timezone.now()
        item.status = target
        item.row_version += 1
        update_fields = ["status", "row_version", "updated_at"]
        if target == ListInstance.Status.ACTIVE:
            item.opened_at = now
            item.closed_at = None
            update_fields.extend(["opened_at", "closed_at"])
        elif target == ListInstance.Status.REOPENED:
            item.reopened_at = now
            item.closed_at = None
            update_fields.extend(["reopened_at", "closed_at"])
        elif target == ListInstance.Status.CLOSED:
            item.closed_at = now
            update_fields.append("closed_at")
        elif target == ListInstance.Status.ARCHIVED:
            item.archived_at = now
            update_fields.append("archived_at")
        item.save(update_fields=update_fields)
        record_audit(
            actor=request.user,
            action=f"list_instance.{target}",
            resource_type="list_instance",
            resource_id=item.id,
            request=request,
            metadata={"reason": reason},
            before=before,
            after=self.get_serializer(item).data,
        )
        return Response(self.get_serializer(item).data)

    @extend_schema(request=ListInstanceLifecycleSerializer, responses=ListInstanceSerializer)
    @action(detail=True, methods=["post"])
    @transaction.atomic
    def activate(self, request, pk=None):
        return self._lifecycle(request, ListInstance.Status.ACTIVE, {ListInstance.Status.PLANNED, ListInstance.Status.CLOSED})

    @extend_schema(request=ListInstanceLifecycleSerializer, responses=ListInstanceSerializer)
    @action(detail=True, methods=["post"])
    @transaction.atomic
    def close(self, request, pk=None):
        return self._lifecycle(request, ListInstance.Status.CLOSED, {ListInstance.Status.ACTIVE, ListInstance.Status.REOPENED})

    @extend_schema(request=ListInstanceLifecycleSerializer, responses=ListInstanceSerializer)
    @action(detail=True, methods=["post"])
    @transaction.atomic
    def reopen(self, request, pk=None):
        return self._lifecycle(request, ListInstance.Status.REOPENED, {ListInstance.Status.CLOSED})

    @extend_schema(request=ListInstanceLifecycleSerializer, responses=ListInstanceSerializer)
    @action(detail=True, methods=["post"])
    @transaction.atomic
    def archive(self, request, pk=None):
        return self._lifecycle(request, ListInstance.Status.ARCHIVED, {ListInstance.Status.CLOSED})

    @extend_schema(request=ListInstanceRolloverSerializer, responses={201: ListInstanceSerializer})
    @action(detail=True, methods=["post"])
    @transaction.atomic
    def rollover(self, request, pk=None):
        source = self.get_object()
        assert_if_match(request, source)
        payload = ListInstanceRolloverSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        item = ListInstance.objects.create(
            definition=source.definition,
            configuration_version=source.configuration_version,
            period_key=payload.validated_data["period_key"],
            label=payload.validated_data["label"],
            status=ListInstance.Status.PLANNED,
            scheduled_open_at=payload.validated_data.get("scheduled_open_at"),
            created_by=request.user,
        )
        record_audit(
            actor=request.user,
            action="list_instance.rollover.prepared",
            resource_type="list_instance",
            resource_id=item.id,
            request=request,
            metadata={"source_instance_id": str(source.id)},
            after=self.get_serializer(item).data,
        )
        return Response(self.get_serializer(item).data, status=status.HTTP_201_CREATED)


class GenericListItemViewSet(viewsets.ModelViewSet):
    queryset = GenericListItem.objects.select_related("instance", "created_by")
    serializer_class = GenericListItemSerializer
    permission_classes = [HasViewCapability]
    action_capabilities = {"list": Capability.CORRESPONDENCE_READ, "retrieve": Capability.CORRESPONDENCE_READ, "create": Capability.CORRESPONDENCE_CREATE, "update": Capability.CORRESPONDENCE_UPDATE, "partial_update": Capability.CORRESPONDENCE_UPDATE, "destroy": Capability.CORRESPONDENCE_UPDATE}
    filterset_fields = ["instance", "status"]
    search_fields = ["label", "search_text"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]


@extend_schema(responses=OperationalStatusSerializer)
@api_view(["GET"])
def operational_status(request):
    if not has_capability(request.user, Capability.SYSTEM_MANAGE):
        raise PermissionDenied()
    cache_status, storage_status = _dependency_status()
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_database_size(current_database())")
        database_size = cursor.fetchone()[0]
    return Response({
        "version": settings.NUMA_VERSION,
        "database": {"status": "ok", "size": database_size},
        "cache": {"status": cache_status},
        "storage": {"status": storage_status},
        "workers": {"status": "configured", "broker": "redis"},
        "counts": {
            "users": UserProfile.objects.count(),
            "correspondences": Correspondence.objects.count(),
            "documents": DocumentVersion.objects.count(),
            "pending_tasks": WorkflowTask.objects.filter(status=WorkflowTask.Status.TODO).count(),
        },
        "server_time": timezone.now(),
    })
