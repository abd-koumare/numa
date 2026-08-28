import hashlib
import json
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from django.db import transaction

from .models import (
    ConfigurationDefinition,
    ConfigurationVersion,
    RuntimeConfigurationBundle,
    RuntimeConfigurationRule,
)


class ConfigurationRuntimeError(ValueError):
    def __init__(self, message: str, *, errors=None):
        super().__init__(message)
        self.errors = errors or [{"path": "configuration", "message": message}]


DEFAULT_BINDINGS = {
    "courriers-externes": {
        "form": "correspondence-form",
        "view": "external-registry-default",
        "numbering": "correspondence-numbering",
        "workflow": "correspondence-validation",
        "rules": ["confidential-access", "urgent-attachment"],
        "signature_policy": "default-signature-policy",
    },
    "courriers-internes": {
        "form": "correspondence-form",
        "view": "internal-registry-default",
        "numbering": "correspondence-numbering",
        "workflow": "correspondence-validation",
        "rules": ["confidential-access", "urgent-attachment"],
        "signature_policy": "default-signature-policy",
    },
    "demandes-achats": {
        "form": "demandes-achats-form",
        "view": "demandes-achats-default",
        "workflow": "finance-validation",
        "rules": ["amount-finance-validation"],
    },
}


def configuration_data(version: ConfigurationVersion | None) -> dict:
    if version is None:
        return {}
    return version.compiled_data or version.data or {}


def _published_version(kind: str, slug: str, *, required: bool) -> ConfigurationVersion | None:
    definition = ConfigurationDefinition.objects.select_related("current_version").filter(
        kind=kind,
        slug=slug,
        active=True,
        current_version__state=ConfigurationVersion.State.PUBLISHED,
    ).first()
    if definition is None:
        if required:
            raise ConfigurationRuntimeError(f"La configuration publiée « {kind}:{slug} » est introuvable.")
        return None
    return definition.current_version


def resolved_bindings(definition: ConfigurationDefinition, list_version: ConfigurationVersion | None = None) -> dict:
    data = configuration_data(list_version or definition.current_version)
    defaults = DEFAULT_BINDINGS.get(definition.slug, {})
    configured = data.get("bindings", {})
    if configured and not isinstance(configured, dict):
        raise ConfigurationRuntimeError("Les liaisons de la liste sont invalides.")
    resolved = {**defaults, **(configured or {})}
    if not isinstance(resolved.get("rules", []), list):
        raise ConfigurationRuntimeError("Les règles liées à la liste sont invalides.")
    return resolved


@transaction.atomic
def resolve_runtime_bundle(
    definition: ConfigurationDefinition,
    *,
    list_version: ConfigurationVersion | None = None,
) -> RuntimeConfigurationBundle:
    definition = (
        ConfigurationDefinition.objects.select_for_update(of=("self",))
        .select_related("current_version")
        .get(pk=definition.pk)
    )
    if list_version is not None:
        list_version = ConfigurationVersion.objects.filter(
            pk=list_version.pk,
            definition=definition,
            state__in=[ConfigurationVersion.State.PUBLISHED, ConfigurationVersion.State.ARCHIVED],
        ).first()
    else:
        list_version = definition.current_version
    if list_version is None or list_version.state not in {
        ConfigurationVersion.State.PUBLISHED,
        ConfigurationVersion.State.ARCHIVED,
    }:
        raise ConfigurationRuntimeError("La liste ne possède aucune version publiée.")
    bindings = resolved_bindings(definition, list_version)
    form = _published_version("form", bindings["form"], required=True) if bindings.get("form") else None
    numbering = _published_version("numbering", bindings["numbering"], required=True) if bindings.get("numbering") else None
    workflow = _published_version("workflow", bindings["workflow"], required=True) if bindings.get("workflow") else None
    signature_policy = (
        _published_version("signature_policy", bindings["signature_policy"], required=True)
        if bindings.get("signature_policy")
        else None
    )
    rules = [
        _published_version("rule", slug, required=True)
        for slug in bindings.get("rules", [])
    ]
    version_ids = {
        "list": str(list_version.id),
        "form": str(form.id) if form else None,
        "numbering": str(numbering.id) if numbering else None,
        "workflow": str(workflow.id) if workflow else None,
        "signature_policy": str(signature_policy.id) if signature_policy else None,
        "rules": [str(version.id) for version in rules],
    }
    digest = hashlib.sha256(
        json.dumps(version_ids, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    bundle, created = RuntimeConfigurationBundle.objects.get_or_create(
        content_hash=digest,
        defaults={
            "list_version": list_version,
            "form_version": form,
            "numbering_version": numbering,
            "workflow_version": workflow,
            "signature_policy_version": signature_policy,
        },
    )
    if not created and (
        bundle.list_version_id != list_version.id
        or bundle.form_version_id != (form.id if form else None)
        or bundle.numbering_version_id != (numbering.id if numbering else None)
        or bundle.workflow_version_id != (workflow.id if workflow else None)
        or bundle.signature_policy_version_id != (signature_policy.id if signature_policy else None)
    ):
        raise ConfigurationRuntimeError("Le bundle existant ne correspond pas à son empreinte.")
    if not created:
        stored_rule_ids = list(bundle.ordered_rules.values_list("version_id", flat=True))
        if stored_rule_ids != [version.id for version in rules]:
            raise ConfigurationRuntimeError("Les règles du bundle existant ne correspondent pas à son empreinte.")
    if created:
        RuntimeConfigurationRule.objects.bulk_create(
            [
                RuntimeConfigurationRule(bundle=bundle, version=version, position=position)
                for position, version in enumerate(rules)
            ]
        )
    return bundle


def _path_value(values: dict, path: str):
    current = values
    for part in path.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return None
    return current


def evaluate_condition(node, values: dict) -> bool:
    if not isinstance(node, dict):
        return False
    operator = node.get("operator")
    if operator == "and":
        return all(evaluate_condition(item, values) for item in node.get("operands", []))
    if operator == "or":
        return any(evaluate_condition(item, values) for item in node.get("operands", []))
    if operator == "not":
        return not evaluate_condition(node.get("operand"), values)
    actual = _path_value(values, node.get("field", ""))
    expected = node.get("value")
    if operator == "exists":
        return actual is not None and actual != ""
    if operator == "eq":
        return actual == expected
    if operator == "neq":
        return actual != expected
    if operator == "contains":
        try:
            return expected in actual
        except TypeError:
            return False
    if operator == "in":
        try:
            return actual in expected
        except TypeError:
            return False
    if operator == "not_in":
        try:
            return actual not in expected
        except TypeError:
            return False
    try:
        if operator == "gt":
            return actual > expected
        if operator == "gte":
            return actual >= expected
        if operator == "lt":
            return actual < expected
        if operator == "lte":
            return actual <= expected
    except TypeError:
        return False
    return False


def evaluate_calculation(node, values: dict):
    if isinstance(node, dict) and "field" in node:
        return _path_value(values, node["field"])
    if not isinstance(node, dict):
        return node
    operands = [evaluate_calculation(item, values) for item in node.get("operands", [])]
    operator = node.get("operator")
    if operator == "coalesce":
        return next((item for item in operands if item not in (None, "")), None)
    try:
        numbers = [Decimal(str(item)) for item in operands]
    except (InvalidOperation, TypeError, ValueError):
        return None
    if operator == "add":
        return sum(numbers, Decimal("0"))
    if operator == "subtract":
        return numbers[0] - sum(numbers[1:], Decimal("0"))
    if operator == "multiply":
        result = Decimal("1")
        for number in numbers:
            result *= number
        return result
    if operator == "divide":
        result = numbers[0]
        try:
            for number in numbers[1:]:
                result /= number
        except (InvalidOperation, ZeroDivisionError):
            return None
        return result
    return None


def _empty(value) -> bool:
    return value is None or value == "" or value == []


def _validate_type(field: dict, value) -> str | None:
    field_type = field.get("type")
    if _empty(value):
        return None
    if field_type in {"text", "textarea"} and not isinstance(value, str):
        return "Une valeur textuelle est attendue."
    if field_type == "number":
        try:
            Decimal(str(value))
        except (InvalidOperation, TypeError, ValueError):
            return "Une valeur numérique est attendue."
    if field_type == "boolean" and not isinstance(value, bool):
        return "Une valeur booléenne est attendue."
    if field_type in {"choice", "multi-choice"} and field.get("options"):
        allowed = {item.get("value") for item in field["options"]}
        selected = value if isinstance(value, list) else [value]
        if any(item not in allowed for item in selected):
            return "Une valeur de choix est invalide."
    if field_type == "date":
        try:
            date.fromisoformat(value)
        except (TypeError, ValueError):
            return "Une date ISO est attendue."
    if field_type == "datetime":
        try:
            datetime.fromisoformat(value.replace("Z", "+00:00"))
        except (AttributeError, TypeError, ValueError):
            return "Une date et heure ISO sont attendues."
    if field_type == "multi-choice" and not isinstance(value, list):
        return "Une liste de valeurs est attendue."
    return None


def validate_form_values(bundle: RuntimeConfigurationBundle, values: dict) -> tuple[dict, list[dict]]:
    if not isinstance(values, dict):
        return {}, [{"path": "data", "message": "Les données doivent être un objet."}]
    normalized = dict(values)
    errors = []
    form = configuration_data(bundle.form_version)
    for field in form.get("fields", []):
        key = field["key"]
        visible = field.get("visible_when") is None or evaluate_condition(field["visible_when"], normalized)
        if field.get("type") == "computed":
            calculated = evaluate_calculation(field.get("expression"), normalized)
            normalized[key] = str(calculated) if isinstance(calculated, Decimal) else calculated
        value = normalized.get(key)
        if visible and field.get("required") and _empty(value):
            errors.append({"path": key, "message": "Ce champ est obligatoire."})
            continue
        if not visible:
            normalized.pop(key, None)
            continue
        type_error = _validate_type(field, value)
        if type_error:
            errors.append({"path": key, "message": type_error})
    return normalized, errors


def matching_rule_actions(bundle: RuntimeConfigurationBundle, event: str, values: dict) -> list[tuple[ConfigurationVersion, dict]]:
    matches = []
    for entry in bundle.ordered_rules.select_related("version").all():
        data = configuration_data(entry.version)
        if event not in data.get("events", ["submit"]):
            continue
        if evaluate_condition(data.get("condition"), values):
            matches.extend((entry.version, action) for action in data.get("actions", []))
    return matches


def rule_validation_errors(bundle: RuntimeConfigurationBundle, event: str, values: dict, *, has_attachment=False) -> list[dict]:
    errors = []
    for _version, action in matching_rule_actions(bundle, event, values):
        action_type = action.get("type")
        if action_type == "require_field":
            field = action.get("field")
            if not field or _empty(_path_value(values, field)):
                errors.append({"path": field or "data", "message": action.get("message") or "Ce champ est requis par une règle métier."})
        elif action_type == "require_attachment" and not has_attachment:
            errors.append({"path": "documents", "message": action.get("message") or "Une pièce jointe est requise par une règle métier."})
    return errors
