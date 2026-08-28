import pytest

from apps.core.configuration import CURRENT_SCHEMA_VERSION, compile_configuration
from apps.core.models import ConfigurationDefinition, ConfigurationVersion
from apps.core.templates import (
    TemplateRuntimeError,
    instantiate_configuration_template,
    render_document_template,
)


@pytest.mark.django_db
def test_legacy_document_template_renders_docx_and_rejects_missing_variables():
    definition = ConfigurationDefinition.objects.select_related("current_version").get(
        kind=ConfigurationDefinition.Kind.TEMPLATE,
        slug="correspondence-acknowledgement",
    )

    rendered = render_document_template(
        definition.current_version,
        {
            "reference": "EXT-0001/2026",
            "sender": "Société Exemple",
            "received_at": "28/08/2026",
            "subject": "Demande",
            "organization_name": "NUMA",
        },
    )

    assert rendered.read(2) == b"PK"
    with pytest.raises(TemplateRuntimeError, match="subject"):
        render_document_template(
            definition.current_version,
            {
                "reference": "EXT-0001/2026",
                "sender": "Société Exemple",
                "received_at": "28/08/2026",
                "organization_name": "NUMA",
            },
        )


@pytest.mark.django_db
def test_configuration_blueprint_creates_a_valid_schema_v2_draft(django_user_model):
    actor = django_user_model.objects.create_user("template-author")
    template_definition = ConfigurationDefinition.objects.create(
        kind=ConfigurationDefinition.Kind.TEMPLATE,
        slug="simple-form-blueprint",
        name="Formulaire simple",
        created_by=actor,
    )
    data = {
        "template_type": "configuration",
        "target_kind": "form",
        "payload": {
            "fields": [
                {"key": "subject", "label": "Objet", "type": "text", "required": True},
            ],
        },
    }
    compiled = compile_configuration("template", data, CURRENT_SCHEMA_VERSION)
    assert compiled.errors == []
    template_version = ConfigurationVersion.objects.create(
        definition=template_definition,
        version=1,
        state=ConfigurationVersion.State.PUBLISHED,
        data=data,
        schema_version=CURRENT_SCHEMA_VERSION,
        compiled_data=compiled.data,
        content_hash=compiled.content_hash,
        created_by=actor,
        published_by=actor,
    )
    template_definition.current_version = template_version
    template_definition.save(update_fields=["current_version"])

    created = instantiate_configuration_template(
        template_version,
        slug="form-from-template",
        name="Formulaire depuis template",
        description="Créé sans données métier.",
        actor=actor,
    )

    draft = created.versions.get()
    assert created.kind == ConfigurationDefinition.Kind.FORM
    assert draft.state == ConfigurationVersion.State.DRAFT
    assert draft.schema_version == CURRENT_SCHEMA_VERSION
    assert draft.validation_errors == []


def test_document_template_compilation_rejects_undeclared_variables():
    compiled = compile_configuration(
        "template",
        {
            "template_type": "document",
            "format": "docx",
            "variables": ["reference"],
            "body": "{{ reference }} — {{ subject }}",
        },
    )

    assert any(error["path"] == "body" for error in compiled.errors)


@pytest.mark.django_db
def test_document_template_runtime_rejects_an_unpublished_version(django_user_model):
    actor = django_user_model.objects.create_user("draft-template-author")
    definition = ConfigurationDefinition.objects.create(
        kind=ConfigurationDefinition.Kind.TEMPLATE,
        slug="draft-document-template",
        name="Modèle non publié",
        created_by=actor,
    )
    data = {
        "template_type": "document",
        "format": "docx",
        "variables": ["reference"],
        "body": "{{ reference }}",
    }
    compiled = compile_configuration("template", data, CURRENT_SCHEMA_VERSION)
    version = ConfigurationVersion.objects.create(
        definition=definition,
        version=1,
        state=ConfigurationVersion.State.DRAFT,
        data=data,
        schema_version=CURRENT_SCHEMA_VERSION,
        compiled_data=compiled.data,
        content_hash=compiled.content_hash,
        created_by=actor,
    )

    with pytest.raises(TemplateRuntimeError, match="publié"):
        render_document_template(version, {"reference": "EXT-0001/2026"})
