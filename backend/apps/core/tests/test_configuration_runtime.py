import pytest

from apps.core.configuration import CURRENT_SCHEMA_VERSION, compile_configuration
from apps.core.models import ConfigurationDefinition, ConfigurationVersion
from apps.core.runtime import configuration_data, resolve_runtime_bundle


@pytest.mark.parametrize(
    ("kind", "data"),
    [
        ("form", {"fields": [{"key": {}, "type": "text", "label": "Invalide"}]}),
        ("workflow", {"steps": [{"key": "review", "kind": "validation", "actor": {}}]}),
        (
            "workflow",
            {
                "steps": [
                    {"key": "start", "kind": "preparation", "actor": "creator"},
                    {"key": "review", "kind": "validation", "actor": "role:validateur"},
                ],
                "transitions": [{"key": {}, "from": {}, "to": "review"}],
            },
        ),
        (
            "rule",
            {
                "condition": {"operator": "exists", "field": "subject"},
                "events": [{}],
                "actions": [{"type": "require_field", "field": "subject"}],
            },
        ),
        ("list", {"registry": "custom", "columns": [], "bindings": {"rules": "not-a-list"}}),
    ],
)
def test_compiler_reports_malformed_json_without_raising(kind, data):
    compiled = compile_configuration(kind, data, CURRENT_SCHEMA_VERSION)

    assert compiled.errors
    assert len(compiled.content_hash) == 64


def test_compiler_is_deterministic_and_derives_linear_workflow_transitions():
    first = compile_configuration(
        "workflow",
        {
            "steps": [
                {"key": "draft", "label": "Brouillon", "kind": "preparation", "actor": "creator"},
                {"key": "review", "label": "Validation", "kind": "validation", "actor": "role:validateur"},
            ],
            "metadata": {"z": 1, "a": 2},
        },
    )
    second = compile_configuration(
        "workflow",
        {
            "metadata": {"a": 2, "z": 1},
            "steps": [
                {"actor": "creator", "kind": "preparation", "label": "Brouillon", "key": "draft"},
                {"actor": "role:validateur", "kind": "validation", "label": "Validation", "key": "review"},
            ],
        },
    )

    assert first.errors == []
    assert first.content_hash == second.content_hash
    assert first.data["transitions"] == [
        {"action": "complete", "from": "draft", "key": "draft-complete", "to": "review"},
    ]


def test_schema_v2_never_accepts_text_conditions():
    compiled = compile_configuration(
        "rule",
        {
            "condition": "amount > 1000",
            "actions": [{"type": "require_field", "field": "manager"}],
        },
    )

    assert {error["path"] for error in compiled.errors} == {"condition"}


@pytest.mark.django_db
def test_runtime_bundle_pins_dependencies_when_a_new_version_is_published():
    list_definition = ConfigurationDefinition.objects.select_related("current_version").get(
        kind=ConfigurationDefinition.Kind.LIST,
        slug="courriers-externes",
    )
    numbering_definition = ConfigurationDefinition.objects.select_related("current_version").get(
        kind=ConfigurationDefinition.Kind.NUMBERING,
        slug="correspondence-numbering",
    )
    original_numbering = numbering_definition.current_version
    original_bundle = resolve_runtime_bundle(
        list_definition,
        list_version=list_definition.current_version,
    )

    original_numbering.state = ConfigurationVersion.State.ARCHIVED
    original_numbering.save(update_fields=["state"])
    replacement = ConfigurationVersion.objects.create(
        definition=numbering_definition,
        version=original_numbering.version + 1,
        state=ConfigurationVersion.State.PUBLISHED,
        data={"format": "NEW/{SEQUENCE:0000}/{ANNEE}", "counterScope": "year"},
        schema_version=1,
    )
    numbering_definition.current_version = replacement
    numbering_definition.save(update_fields=["current_version"])

    replacement_bundle = resolve_runtime_bundle(
        list_definition,
        list_version=list_definition.current_version,
    )

    assert original_bundle.pk != replacement_bundle.pk
    assert original_bundle.numbering_version_id == original_numbering.pk
    assert replacement_bundle.numbering_version_id == replacement.pk
    assert configuration_data(original_bundle.numbering_version)["format"] == "{SERVICE}/{SEQUENCE:0000}/{ANNEE}"
