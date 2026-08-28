from unittest.mock import patch

import pytest
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.core.authentication import KeycloakJWTAuthentication
from apps.core.models import (
    AuditEvent,
    ConfigurationDefinition,
    ConfigurationVersion,
    Correspondence,
    CorrespondenceAccessGrant,
    DocumentVersion,
    OrganizationUnit,
    SignatureProof,
    UserProfile,
    WorkflowInstance,
    WorkflowTask,
)


@pytest.fixture
def units(db):
    return {
        code: OrganizationUnit.objects.create(code=code, name=name)
        for code, name in [("DSI", "Direction des systèmes d’information"), ("DT", "Direction technique")]
    }


@pytest.fixture
def client(settings):
    settings.OIDC_ALLOW_DEV_AUTH = True
    return APIClient(HTTP_X_DEV_USER="api-test")


def draft_payload():
    return {
        "registry": "external",
        "sender": "Société Exemple",
        "origin_reference": "EX-12",
        "received_at": "2026-08-16",
        "channel": "email",
        "subject": "Demande de partenariat",
        "direction_code": "DT",
        "responsible_service_code": "DSI",
        "priority": "high",
        "confidentiality": "standard",
        "due_at": "2026-08-30",
        "summary": "À étudier.",
    }


@pytest.mark.django_db
def test_create_list_and_retrieve_correspondence(client, units):
    created = client.post("/api/v1/correspondences/", draft_payload(), format="json")
    assert created.status_code == 201
    assert created.data["status"] == "draft"
    assert created.data["reference"] is None

    listed = client.get("/api/v1/correspondences/?registry=external")
    assert listed.status_code == 200
    assert listed.data["count"] == 1
    assert listed.data["results"][0]["subject"] == "Demande de partenariat"


@pytest.mark.django_db
def test_submit_assigns_unique_transactional_references(client, units):
    first = client.post("/api/v1/correspondences/", draft_payload(), format="json").data
    second_payload = {**draft_payload(), "subject": "Deuxième courrier"}
    second = client.post("/api/v1/correspondences/", second_payload, format="json").data
    user = Correspondence.objects.get(pk=first["id"]).created_by
    for identifier in [first["id"], second["id"]]:
        DocumentVersion.objects.create(
            correspondence_id=identifier,
            version=1,
            file=SimpleUploadedFile(f"{identifier}.pdf", b"%PDF-test", content_type="application/pdf"),
            filename="document.pdf",
            mime_type="application/pdf",
            size=9,
            sha256="a" * 64,
            scan_status=DocumentVersion.ScanStatus.CLEAN,
            created_by=user,
        )
    first_result = client.post(f"/api/v1/correspondences/{first['id']}/submit/", HTTP_IF_MATCH='"1"')
    second_result = client.post(f"/api/v1/correspondences/{second['id']}/submit/", HTTP_IF_MATCH='"1"')
    assert first_result.status_code == 200
    assert second_result.status_code == 200
    assert first_result.data["reference"] == "DSI/0001/2026"
    assert second_result.data["reference"] == "DSI/0002/2026"


@pytest.mark.django_db
def test_submission_uses_the_numbering_version_pinned_when_the_draft_was_created(client, units):
    item = client.post("/api/v1/correspondences/", draft_payload(), format="json").data
    correspondence = Correspondence.objects.get(pk=item["id"])
    DocumentVersion.objects.create(
        correspondence=correspondence,
        version=1,
        file=SimpleUploadedFile("pinned.pdf", b"%PDF-test", content_type="application/pdf"),
        filename="pinned.pdf",
        mime_type="application/pdf",
        size=9,
        sha256="b" * 64,
        scan_status=DocumentVersion.ScanStatus.CLEAN,
        created_by=correspondence.created_by,
    )
    definition = ConfigurationDefinition.objects.select_related("current_version").get(
        kind=ConfigurationDefinition.Kind.NUMBERING,
        slug="correspondence-numbering",
    )
    draft = client.patch(
        f"/api/v1/configurations/{definition.id}/",
        {"data": {**definition.current_version.data, "format": "NEW/{SEQUENCE:0000}/{ANNEE}"}},
        format="json",
        HTTP_IF_MATCH=f'"{definition.current_version.version}"',
    )
    assert draft.status_code == 200
    published = client.post(
        f"/api/v1/configurations/{definition.id}/publish/",
        {},
        format="json",
        HTTP_IF_MATCH=f'"{draft.data["latest_version"]["version"]}"',
    )
    assert published.status_code == 200

    submitted = client.post(
        f"/api/v1/correspondences/{item['id']}/submit/",
        HTTP_IF_MATCH='"1"',
    )

    assert submitted.status_code == 200
    assert submitted.data["reference"] == "DSI/0001/2026"


@pytest.mark.django_db
def test_pinned_workflow_advances_through_validation_signature_and_archive(client, units):
    item = client.post("/api/v1/correspondences/", draft_payload(), format="json").data
    correspondence = Correspondence.objects.get(pk=item["id"])
    document = DocumentVersion.objects.create(
        correspondence=correspondence,
        version=1,
        file=SimpleUploadedFile("workflow.pdf", b"%PDF-test", content_type="application/pdf"),
        filename="workflow.pdf",
        mime_type="application/pdf",
        size=9,
        sha256="c" * 64,
        scan_status=DocumentVersion.ScanStatus.CLEAN,
        created_by=correspondence.created_by,
    )

    submitted = client.post(
        f"/api/v1/correspondences/{item['id']}/submit/",
        {},
        format="json",
        HTTP_IF_MATCH='"1"',
    )
    assert submitted.status_code == 200
    workflow = WorkflowInstance.objects.get(correspondence_id=item["id"])
    correspondence.refresh_from_db()
    assert workflow.definition_version_id == correspondence.configuration_bundle.workflow_version_id
    assert workflow.current_step == "validation"
    assert workflow.tasks.get(step_key="validation").kind == WorkflowTask.Kind.VALIDATION

    validated = client.post(
        f"/api/v1/correspondences/{item['id']}/validate/",
        {},
        format="json",
        HTTP_IF_MATCH='"2"',
    )
    assert validated.status_code == 200
    workflow.refresh_from_db()
    assert workflow.status == WorkflowInstance.Status.RUNNING
    assert workflow.current_step == "signature"
    assert workflow.tasks.get(step_key="signature").kind == WorkflowTask.Kind.SIGNATURE

    context = workflow.context
    next(step for step in context["steps"] if step["key"] == "signature")["optional"] = False
    workflow.context = context
    workflow.save(update_fields=["context"])
    bypassed_signature = client.post(
        f"/api/v1/correspondences/{item['id']}/archive/",
        {},
        format="json",
        HTTP_IF_MATCH='"3"',
    )
    assert bypassed_signature.status_code == 409
    correspondence.refresh_from_db()
    assert correspondence.status == Correspondence.Status.VALIDATED

    digital = client.post(
        f"/api/v1/correspondences/{item['id']}/sign/",
        {"document_version_id": str(document.id), "level": SignatureProof.Level.DIGITAL},
        format="json",
        HTTP_IF_MATCH='"3"',
    )
    assert digital.status_code == 409
    assert SignatureProof.objects.filter(correspondence_id=item["id"]).count() == 0

    signed = client.post(
        f"/api/v1/correspondences/{item['id']}/sign/",
        {"document_version_id": str(document.id), "level": SignatureProof.Level.INTERNAL},
        format="json",
        HTTP_IF_MATCH='"3"',
    )
    assert signed.status_code == 200
    proof = SignatureProof.objects.get(correspondence_id=item["id"])
    assert proof.policy_version_id == correspondence.configuration_bundle.signature_policy_version_id
    assert proof.provider == "numa-internal"
    workflow.refresh_from_db()
    assert workflow.current_step == "archive"

    archived = client.post(
        f"/api/v1/correspondences/{item['id']}/archive/",
        {},
        format="json",
        HTTP_IF_MATCH='"4"',
    )
    assert archived.status_code == 200
    workflow.refresh_from_db()
    assert workflow.status == WorkflowInstance.Status.COMPLETED


@pytest.mark.django_db
def test_confidential_rule_removes_manual_grants_and_audits_the_effect(client, units):
    payload = {**draft_payload(), "confidentiality": "confidential"}
    item = client.post("/api/v1/correspondences/", payload, format="json").data
    correspondence = Correspondence.objects.get(pk=item["id"])
    extra_user = User.objects.create_user("manual-reader")
    CorrespondenceAccessGrant.objects.create(
        correspondence=correspondence,
        user=extra_user,
        source=CorrespondenceAccessGrant.Source.MANUAL,
        capabilities=["read"],
        created_by=correspondence.created_by,
    )
    DocumentVersion.objects.create(
        correspondence=correspondence,
        version=1,
        file=SimpleUploadedFile("confidential.pdf", b"%PDF-test", content_type="application/pdf"),
        filename="confidential.pdf",
        mime_type="application/pdf",
        size=9,
        sha256="d" * 64,
        scan_status=DocumentVersion.ScanStatus.CLEAN,
        created_by=correspondence.created_by,
    )

    submitted = client.post(
        f"/api/v1/correspondences/{item['id']}/submit/",
        {},
        format="json",
        HTTP_IF_MATCH='"1"',
    )

    assert submitted.status_code == 200
    assert not correspondence.access_grants.filter(source=CorrespondenceAccessGrant.Source.MANUAL).exists()
    assert AuditEvent.objects.filter(
        resource_id=str(correspondence.id),
        action="correspondence.rules.submit",
    ).exists()


@pytest.mark.django_db
def test_submission_requires_a_clean_document(client, units):
    item = client.post("/api/v1/correspondences/", draft_payload(), format="json").data
    response = client.post(f"/api/v1/correspondences/{item['id']}/submit/", HTTP_IF_MATCH='"1"')
    assert response.status_code == 400
    assert response.data["code"] == "validation_error"
    assert "documents" in response.data["errors"]


@pytest.mark.django_db
def test_document_upload_validates_type_and_enqueues_scan(client, units):
    item = client.post("/api/v1/correspondences/", draft_payload(), format="json").data
    bad = SimpleUploadedFile("script.exe", b"bad", content_type="application/octet-stream")
    rejected = client.post(f"/api/v1/correspondences/{item['id']}/documents/", {"file": bad}, format="multipart")
    assert rejected.status_code == 400

    good = SimpleUploadedFile("letter.pdf", b"%PDF-test", content_type="application/pdf")
    with patch("apps.core.views.scan_document.delay") as enqueue:
        accepted = client.post(
            f"/api/v1/correspondences/{item['id']}/documents/",
            {"file": good},
            format="multipart",
            HTTP_IF_MATCH='"1"',
        )
    assert accepted.status_code == 201
    assert accepted.data["document"]["scan_status"] == "pending"
    assert accepted.data["row_version"] == 2
    enqueue.assert_called_once()

    document = DocumentVersion.objects.get(pk=accepted.data["document"]["id"])
    document.scan_status = DocumentVersion.ScanStatus.CLEAN
    document.save(update_fields=["scan_status"])
    download = client.get(f"/api/v1/correspondences/{item['id']}/documents/{document.id}/download/")
    assert download.status_code == 200
    assert "attachment" in download["Content-Disposition"]


@pytest.mark.django_db
def test_health_is_public(client):
    response = APIClient().get("/api/v1/health/")
    assert response.status_code == 200
    assert response.data["database"] == "ok"


@pytest.mark.django_db
def test_business_api_requires_a_bearer_token():
    response = APIClient().get("/api/v1/correspondences/")
    assert response.status_code == 401
    assert response["WWW-Authenticate"].startswith("Bearer")


@pytest.mark.django_db(transaction=True)
def test_oidc_sync_locks_profile_without_locking_nullable_organization_unit(units):
    user = User.objects.create(username="oidc-existing")
    UserProfile.objects.create(
        user=user,
        keycloak_subject="oidc-subject",
        organization_unit=units["DSI"],
    )

    authenticated_user = KeycloakJWTAuthentication()._sync_user(
        {
            "sub": "oidc-subject",
            "preferred_username": "oidc-existing",
            "realm_access": {"roles": []},
            "resource_access": {},
            "groups": [],
        }
    )

    assert authenticated_user == user


@pytest.mark.django_db
def test_mutations_require_current_if_match(client, units):
    item = client.post("/api/v1/correspondences/", draft_payload(), format="json").data
    missing = client.patch(
        f"/api/v1/correspondences/{item['id']}/",
        {"subject": "Objet modifié"},
        format="json",
    )
    assert missing.status_code == 428
    assert missing.data["code"] == "if_match_required"

    stale = client.patch(
        f"/api/v1/correspondences/{item['id']}/",
        {"subject": "Objet modifié"},
        format="json",
        HTTP_IF_MATCH='"999"',
    )
    assert stale.status_code == 409
    assert stale.data["code"] == "stale_version"


@pytest.mark.django_db
def test_preferences_and_system_settings_use_etags(client):
    preferences = client.get("/api/v1/me/preferences/")
    assert preferences.status_code == 200
    assert preferences["ETag"] == '"1"'

    missing = client.patch("/api/v1/me/preferences/", {"page_size": 50}, format="json")
    assert missing.status_code == 428
    updated = client.patch(
        "/api/v1/me/preferences/",
        {"page_size": 50, "email_notifications": False},
        format="json",
        HTTP_IF_MATCH=preferences["ETag"],
    )
    assert updated.status_code == 200
    assert updated.data["page_size"] == 50
    assert updated["ETag"] == '"2"'

    general = client.get("/api/v1/system-settings/general/")
    assert general.status_code == 200
    system_updated = client.patch(
        "/api/v1/system-settings/general/",
        {"values": {**general.data["values"], "defaultHome": "tasks"}},
        format="json",
        HTTP_IF_MATCH=general["ETag"],
    )
    assert system_updated.status_code == 200
    assert system_updated.data["values"]["defaultHome"] == "tasks"


@pytest.mark.django_db
def test_numbering_preview_and_dashboard_periods(client, units):
    preview = client.post(
        "/api/v1/numbering/preview/",
        {
            "registry": "external",
            "service_code": "DSI",
            "direction_code": "DT",
            "received_at": "2026-08-27",
            "sequence": 53,
        },
        format="json",
    )
    assert preview.status_code == 200
    assert preview.data["reference"] == "DSI/0053/2026"
    assert preview.data["available"] is True

    for period, expected_points in [("7d", 7), ("4w", 4), ("12m", 12)]:
        response = client.get(f"/api/v1/dashboard/?period={period}")
        assert response.status_code == 200
        assert response.data["period"] == period
        assert len(response.data["series"]) == expected_points


@pytest.mark.django_db
def test_list_instance_lifecycle_is_versioned_and_audited(client):
    definition = ConfigurationDefinition.objects.create(
        kind=ConfigurationDefinition.Kind.LIST,
        slug="registre-cycle-test",
        name="Registre cycle test",
    )
    version = ConfigurationVersion.objects.create(
        definition=definition,
        version=1,
        state=ConfigurationVersion.State.PUBLISHED,
        data={"registry": "custom", "columns": []},
    )
    definition.current_version = version
    definition.save(update_fields=["current_version"])
    created = client.post(
        "/api/v1/list-instances/",
        {
            "definition": str(definition.id),
            "configuration_version": str(version.id),
            "period_key": "2099",
            "label": "Instance 2099",
            "status": "planned",
        },
        format="json",
    )
    assert created.status_code == 201
    identifier = created.data["id"]

    activated = client.post(f"/api/v1/list-instances/{identifier}/activate/", {}, format="json", HTTP_IF_MATCH='"1"')
    assert activated.status_code == 200
    assert activated.data["status"] == "active"
    assert activated.data["row_version"] == 2

    missing_reason = client.post(f"/api/v1/list-instances/{identifier}/close/", {}, format="json", HTTP_IF_MATCH='"2"')
    assert missing_reason.status_code == 400
    closed = client.post(
        f"/api/v1/list-instances/{identifier}/close/",
        {"reason": "Fin de période"},
        format="json",
        HTTP_IF_MATCH='"2"',
    )
    assert closed.status_code == 200
    assert closed.data["status"] == "closed"
    assert closed.data["closed_at"] is not None

    reopen_without_reason = client.post(
        f"/api/v1/list-instances/{identifier}/reopen/",
        {},
        format="json",
        HTTP_IF_MATCH='"3"',
    )
    assert reopen_without_reason.status_code == 400
    reopened = client.post(
        f"/api/v1/list-instances/{identifier}/reopen/",
        {"reason": "Traitement exceptionnel d’un dossier tardif"},
        format="json",
        HTTP_IF_MATCH='"3"',
    )
    assert reopened.status_code == 200
    assert reopened.data["status"] == "reopened"
    assert reopened.data["reopened_at"] is not None
    assert reopened.data["row_version"] == 4
    assert AuditEvent.objects.filter(resource_id=identifier, action="list_instance.reopened").exists()


@pytest.mark.django_db
def test_configuration_publish_archives_previous_version_and_supports_rollback(client):
    definition = ConfigurationDefinition.objects.select_related("current_version").get(
        kind=ConfigurationDefinition.Kind.LIST,
        slug="courriers-externes",
    )
    original = definition.current_version
    draft = client.patch(
        f"/api/v1/configurations/{definition.id}/",
        {"description": "Registre modifié", "data": {**original.data, "retention_years": 12}},
        format="json",
        HTTP_IF_MATCH=f'"{original.version}"',
    )
    assert draft.status_code == 200
    assert draft.data["latest_version"]["state"] == "draft"
    assert draft.data["latest_version"]["schema_version"] == original.schema_version

    published = client.post(
        f"/api/v1/configurations/{definition.id}/publish/",
        {},
        format="json",
        HTTP_IF_MATCH=f'"{draft.data["latest_version"]["version"]}"',
    )
    assert published.status_code == 200
    original.refresh_from_db()
    assert original.state == ConfigurationVersion.State.ARCHIVED
    assert published.data["current_version"]["data"]["retention_years"] == 12

    rollback = client.post(
        f"/api/v1/configurations/{definition.id}/rollback/",
        {"version": original.version},
        format="json",
        HTTP_IF_MATCH=f'"{published.data["latest_version"]["version"]}"',
    )
    assert rollback.status_code == 201
    assert rollback.data["state"] == "draft"
    assert rollback.data["data"] == original.data
    assert AuditEvent.objects.filter(resource_id=str(definition.id), action="configuration.rollback.prepared").exists()
