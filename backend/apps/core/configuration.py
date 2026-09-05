import copy
import hashlib
import json
import re
from dataclasses import dataclass


CURRENT_SCHEMA_VERSION = 2
MAX_EXPRESSION_DEPTH = 12
MAX_EXPRESSION_NODES = 256

ALLOWED_PAGE_BLOCKS = {
    "heading",
    "text",
    "callout",
    "button",
    "link-list",
    "metric",
    "chart",
    "list-view",
    "task-list",
    "recent-activity",
}
ALLOWED_PAGE_SOURCES = {
    "dashboard.metrics",
    "dashboard.series",
    "tasks.mine",
    "correspondences.recent",
    "activity.recent",
}
ALLOWED_FIELD_TYPES = {
    "text",
    "textarea",
    "number",
    "date",
    "datetime",
    "boolean",
    "choice",
    "multi-choice",
    "user",
    "group",
    "organization-unit",
    "file",
    "relation",
    "computed",
}
ALLOWED_RULE_OPERATORS = {
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "in",
    "not_in",
    "contains",
    "and",
    "or",
    "not",
    "exists",
}
ALLOWED_CALCULATION_OPERATORS = {"add", "subtract", "multiply", "divide", "coalesce"}
ALLOWED_RULE_EVENTS = {"create", "update", "submit", "transition", "sign", "archive"}
ALLOWED_RULE_ACTIONS = {
    "require_field",
    "require_attachment",
    "restrict_to_responsible_service",
    "add_workflow_step",
    "assign_task",
    "notify",
}
ALLOWED_WORKFLOW_STEP_KINDS = {"preparation", "processing", "validation", "approval", "signature", "archive", "automation"}
ALLOWED_ACTOR_PREFIXES = {"creator", "responsible-service", "system"}
ALLOWED_TEMPLATE_TARGETS = {"list", "form", "view", "rule", "workflow", "page"}
ALLOWED_TEMPLATE_FORMATS = {"docx"}
FIELD_KEY = re.compile(r"[a-z][a-z0-9_]{0,63}")
SLUG = re.compile(r"[a-z0-9][a-z0-9_-]{0,119}")
FIELD_PATH = re.compile(r"[a-zA-Z][\w.]{0,119}")
SAFE_EXPRESSION = re.compile(r"^[\w\sÀ-ÿ.()'\"=<>!:+\-/*%,]+$")
TEMPLATE_VARIABLE = re.compile(r"{{\s*([a-zA-Z][\w.]{0,119})\s*}}")
FORBIDDEN_EXPRESSION_WORDS = re.compile(
    r"\b(eval|exec|import|lambda|class|function|fetch|window|document|process|require)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class CompiledConfiguration:
    data: dict
    errors: list[dict]
    dependencies: list[dict]
    content_hash: str


def _error(path: str, message: str) -> dict:
    return {"path": path, "message": message}


def _canonical(value):
    return json.loads(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False))


def _content_hash(kind: str, schema_version: int, data: dict) -> str:
    payload = json.dumps(
        {"kind": kind, "schema_version": schema_version, "data": data},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _valid_slug(value) -> bool:
    return isinstance(value, str) and bool(SLUG.fullmatch(value))


def _validate_condition(node, path="condition", depth=0, counter=None, *, allow_legacy=False):
    errors = []
    if counter is None:
        counter = [0]
    counter[0] += 1
    if counter[0] > MAX_EXPRESSION_NODES:
        return [_error(path, "L’expression contient trop de nœuds.")]
    if depth > MAX_EXPRESSION_DEPTH:
        return [_error(path, "La condition dépasse la profondeur maximale.")]
    if isinstance(node, str):
        if not allow_legacy:
            return [_error(path, "Utilisez le langage de règles structuré; les expressions texte ne sont pas exécutables.")]
        if len(node) > 1000 or not SAFE_EXPRESSION.fullmatch(node) or FORBIDDEN_EXPRESSION_WORDS.search(node):
            errors.append(_error(path, "L’expression historique contient une instruction non autorisée."))
        return errors
    if not isinstance(node, dict):
        return [_error(path, "Une condition doit être un objet DSL.")]
    operator = node.get("operator")
    if operator not in ALLOWED_RULE_OPERATORS:
        errors.append(_error(f"{path}.operator", "Opérateur non autorisé."))
        return errors
    if operator in {"and", "or"}:
        operands = node.get("operands")
        if not isinstance(operands, list) or len(operands) < 2:
            errors.append(_error(f"{path}.operands", "Au moins deux conditions sont requises."))
        else:
            for index, operand in enumerate(operands):
                errors.extend(_validate_condition(operand, f"{path}.operands.{index}", depth + 1, counter, allow_legacy=allow_legacy))
    elif operator == "not":
        errors.extend(_validate_condition(node.get("operand"), f"{path}.operand", depth + 1, counter, allow_legacy=allow_legacy))
    else:
        field = node.get("field")
        if not isinstance(field, str) or not FIELD_PATH.fullmatch(field):
            errors.append(_error(f"{path}.field", "Nom de champ invalide."))
        if operator != "exists" and "value" not in node:
            errors.append(_error(f"{path}.value", "Valeur manquante."))
    return errors


def _validate_calculation(node, path="expression", depth=0, counter=None):
    if counter is None:
        counter = [0]
    counter[0] += 1
    if counter[0] > MAX_EXPRESSION_NODES:
        return [_error(path, "Le calcul contient trop de nœuds.")]
    if depth > MAX_EXPRESSION_DEPTH:
        return [_error(path, "Le calcul dépasse la profondeur maximale.")]
    if isinstance(node, (int, float, str)) or node is None:
        return []
    if not isinstance(node, dict):
        return [_error(path, "Calcul invalide.")]
    if "field" in node:
        return [] if isinstance(node["field"], str) and FIELD_PATH.fullmatch(node["field"]) else [_error(f"{path}.field", "Champ invalide.")]
    operator = node.get("operator")
    if operator not in ALLOWED_CALCULATION_OPERATORS:
        return [_error(f"{path}.operator", "Opérateur de calcul non autorisé.")]
    operands = node.get("operands")
    if not isinstance(operands, list) or len(operands) < 2:
        return [_error(f"{path}.operands", "Au moins deux opérandes sont requis.")]
    errors = []
    for index, operand in enumerate(operands):
        errors.extend(_validate_calculation(operand, f"{path}.operands.{index}", depth + 1, counter))
    return errors


def _validate_form(data: dict, *, allow_legacy: bool) -> list[dict]:
    fields = data.get("fields", [])
    if not isinstance(fields, list):
        return [_error("fields", "Les champs doivent être une liste.")]
    errors = []
    keys = set()
    for index, field in enumerate(fields):
        path = f"fields.{index}"
        if not isinstance(field, dict):
            errors.append(_error(path, "Définition de champ invalide."))
            continue
        key = field.get("key")
        if not isinstance(key, str) or not FIELD_KEY.fullmatch(key):
            errors.append(_error(f"{path}.key", "Clé de champ invalide."))
        elif key in keys:
            errors.append(_error(f"{path}.key", "Cette clé est utilisée plusieurs fois."))
        else:
            keys.add(key)
        field_type = field.get("type")
        if field_type not in ALLOWED_FIELD_TYPES:
            errors.append(_error(f"{path}.type", "Type de champ non autorisé."))
        if not isinstance(field.get("label"), str) or not field.get("label", "").strip():
            errors.append(_error(f"{path}.label", "Le libellé est obligatoire."))
        if field_type in {"choice", "multi-choice"} and not allow_legacy:
            options = field.get("options", [])
            if not isinstance(options, list) or not options or not all(isinstance(item, dict) and "value" in item and "label" in item for item in options):
                errors.append(_error(f"{path}.options", "Définissez au moins une option avec value et label."))
        if field_type == "relation" and not _valid_slug(field.get("target_list")):
            errors.append(_error(f"{path}.target_list", "La liste cible est invalide."))
        if field_type == "computed":
            errors.extend(_validate_calculation(field.get("expression"), f"{path}.expression"))
        if field.get("visible_when") is not None:
            errors.extend(_validate_condition(field["visible_when"], f"{path}.visible_when", allow_legacy=allow_legacy))
    return errors


def _validate_workflow(data: dict, *, allow_legacy: bool) -> tuple[list[dict], dict]:
    compiled = copy.deepcopy(data)
    steps = compiled.get("steps", [])
    if not isinstance(steps, list) or not steps:
        return [_error("steps", "Le workflow doit contenir au moins une étape.")], compiled
    if len(steps) > 100:
        return [_error("steps", "Un workflow ne peut pas dépasser 100 étapes.")], compiled
    errors = []
    keys = set()
    for index, step in enumerate(steps):
        path = f"steps.{index}"
        key = step.get("key") if isinstance(step, dict) else None
        if not isinstance(key, str) or not FIELD_KEY.fullmatch(key.replace("-", "_")):
            errors.append(_error(f"{path}.key", "Clé d’étape invalide."))
            continue
        if key in keys:
            errors.append(_error(f"{path}.key", "Cette étape est dupliquée."))
        keys.add(key)
        if step.get("kind") not in ALLOWED_WORKFLOW_STEP_KINDS:
            errors.append(_error(f"{path}.kind", "Type d’étape non autorisé."))
        actor = step.get("actor", "system")
        if not isinstance(actor, str) or (
            actor not in ALLOWED_ACTOR_PREFIXES
            and not any(
                actor.startswith(prefix) and len(actor) > len(prefix)
                for prefix in ("role:", "group:", "user:")
            )
        ):
            errors.append(_error(f"{path}.actor", "Sélecteur d’acteur non autorisé."))
        if not isinstance(step.get("due_days", 0), int) or not 0 <= step.get("due_days", 0) <= 3650:
            errors.append(_error(f"{path}.due_days", "Le délai doit être compris entre 0 et 3650 jours."))
    transitions = compiled.get("transitions")
    if transitions is None:
        valid_step_keys = [
            step.get("key")
            for step in steps
            if isinstance(step, dict) and isinstance(step.get("key"), str)
        ]
        transitions = []
        if len(valid_step_keys) == len(steps):
            transitions = [
                {
                    "key": f"{valid_step_keys[index]}-complete",
                    "from": valid_step_keys[index],
                    "to": valid_step_keys[index + 1],
                    "action": "complete",
                }
                for index in range(len(valid_step_keys) - 1)
            ]
        compiled["transitions"] = transitions
    if not isinstance(transitions, list):
        errors.append(_error("transitions", "Les transitions doivent être une liste."))
    else:
        transition_keys = set()
        for index, transition in enumerate(transitions):
            path = f"transitions.{index}"
            if not isinstance(transition, dict):
                errors.append(_error(path, "Transition invalide."))
                continue
            key = transition.get("key")
            if not _valid_slug(key) or (isinstance(key, str) and key in transition_keys):
                errors.append(_error(f"{path}.key", "Clé de transition invalide ou dupliquée."))
            elif isinstance(key, str):
                transition_keys.add(key)
            source = transition.get("from")
            target = transition.get("to")
            if (
                not isinstance(source, str)
                or source not in keys
                or not isinstance(target, str)
                or target not in keys
            ):
                errors.append(_error(path, "La transition référence une étape inconnue."))
            action_name = transition.get("action", "complete")
            if not _valid_slug(action_name):
                errors.append(_error(f"{path}.action", "Action de transition invalide."))
            if transition.get("condition") is not None:
                errors.extend(_validate_condition(transition["condition"], f"{path}.condition", allow_legacy=allow_legacy))
    return errors, compiled


def _valid_actor_selector(value) -> bool:
    return isinstance(value, str) and (
        value in ALLOWED_ACTOR_PREFIXES
        or any(value.startswith(prefix) and len(value) > len(prefix) for prefix in ("role:", "group:", "user:"))
    )


def _validate_rule_action(action, path: str, *, allow_legacy: bool) -> list[dict]:
    if not isinstance(action, dict) or action.get("type") not in ALLOWED_RULE_ACTIONS:
        return [_error(f"{path}.type", "Action de règle non autorisée.")]
    errors = []
    action_type = action["type"]
    if action_type == "require_field":
        if not isinstance(action.get("field"), str) or not FIELD_PATH.fullmatch(action["field"]):
            errors.append(_error(f"{path}.field", "Le champ requis est invalide."))
    elif action_type == "add_workflow_step":
        step = action.get("step")
        workflow = action.get("workflow")
        if step is None and not _valid_slug(workflow):
            errors.append(_error(path, "Définissez une étape structurée ou un workflow valide."))
        if step is not None:
            step_errors, _compiled = _validate_workflow({"steps": [step]}, allow_legacy=allow_legacy)
            errors.extend(
                _error(f"{path}.step.{error['path']}", error["message"])
                for error in step_errors
            )
        if action.get("after") is not None and not _valid_slug(action["after"]):
            errors.append(_error(f"{path}.after", "L’étape d’insertion est invalide."))
    elif action_type == "assign_task":
        if action.get("key") is not None and not _valid_slug(action["key"]):
            errors.append(_error(f"{path}.key", "Clé de tâche invalide."))
        if not isinstance(action.get("label"), str) or not action["label"].strip():
            errors.append(_error(f"{path}.label", "Le libellé de tâche est obligatoire."))
        if action.get("kind", "processing") not in {"processing", "validation", "approval", "signature"}:
            errors.append(_error(f"{path}.kind", "Type de tâche invalide."))
        if not _valid_actor_selector(action.get("actor", "responsible-service")):
            errors.append(_error(f"{path}.actor", "Sélecteur d’acteur invalide."))
        due_days = action.get("due_days", 0)
        if not isinstance(due_days, int) or not 0 <= due_days <= 3650:
            errors.append(_error(f"{path}.due_days", "Le délai doit être compris entre 0 et 3650 jours."))
    elif action_type == "notify":
        if not _valid_actor_selector(action.get("recipient", "responsible-service")):
            errors.append(_error(f"{path}.recipient", "Destinataire invalide."))
        if not isinstance(action.get("title"), str) or not action["title"].strip():
            errors.append(_error(f"{path}.title", "Le titre de notification est obligatoire."))
    return errors


def _dependencies(kind: str, data: dict) -> list[dict]:
    if kind != "list":
        return []
    bindings = data.get("bindings", {})
    if not isinstance(bindings, dict):
        return []
    dependencies = []
    kind_map = {
        "form": "form",
        "view": "view",
        "numbering": "numbering",
        "workflow": "workflow",
        "signature_policy": "signature_policy",
    }
    for role, target_kind in kind_map.items():
        slug = bindings.get(role)
        if slug:
            dependencies.append({"role": role, "kind": target_kind, "slug": slug, "position": 0})
    rules = bindings.get("rules", [])
    for position, slug in enumerate(rules if isinstance(rules, list) else []):
        dependencies.append({"role": "rule", "kind": "rule", "slug": slug, "position": position})
    return dependencies


def compile_configuration(kind: str, data, schema_version: int = CURRENT_SCHEMA_VERSION) -> CompiledConfiguration:
    if not isinstance(data, dict):
        errors = [_error("data", "La configuration doit être un objet JSON.")]
        return CompiledConfiguration({}, errors, [], _content_hash(kind, schema_version, {}))
    compiled = copy.deepcopy(data)
    errors: list[dict] = []
    allow_legacy = schema_version <= 1

    if kind == "list":
        if data.get("registry", "custom") not in {"internal", "external", "custom"}:
            errors.append(_error("registry", "Registre invalide."))
        if data.get("periodicity", "none") not in {"none", "yearly", "monthly", "quarterly", "custom"}:
            errors.append(_error("periodicity", "Périodicité invalide."))
        if not isinstance(data.get("columns", []), list):
            errors.append(_error("columns", "Les colonnes doivent être une liste."))
        bindings = data.get("bindings", {})
        if bindings and not isinstance(bindings, dict):
            errors.append(_error("bindings", "Les liaisons doivent être un objet."))
        elif isinstance(bindings, dict):
            if not isinstance(bindings.get("rules", []), list):
                errors.append(_error("bindings.rules", "Les règles liées doivent être une liste."))
            for dependency in _dependencies(kind, data):
                if not _valid_slug(dependency["slug"]):
                    errors.append(_error(f"bindings.{dependency['role']}", "Référence de configuration invalide."))
    elif kind == "form":
        errors.extend(_validate_form(data, allow_legacy=allow_legacy))
    elif kind == "view":
        if not _valid_slug(data.get("list")):
            errors.append(_error("list", "La vue doit référencer une liste."))
        for key in ("columns", "filters", "ordering"):
            if not isinstance(data.get(key, []), list):
                errors.append(_error(key, f"{key} doit être une liste."))
    elif kind == "numbering":
        value = data.get("format", "")
        if not isinstance(value, str) or not re.search(r"\{SEQUENCE(?::0+)?\}", value):
            errors.append(_error("format", "Le format doit contenir {SEQUENCE}."))
        allowed_variables = {"ANNEE", "MOIS", "JOUR", "LISTE", "TYPE", "DIRECTION", "SERVICE", "SITE", "UTILISATEUR", "REGISTRE"}
        for token in re.findall(r"\{([^}]+)\}", value if isinstance(value, str) else ""):
            if not re.fullmatch(r"SEQUENCE(?::0+)?", token) and token not in allowed_variables and not token.startswith("CHAMP:"):
                errors.append(_error("format", f"Variable inconnue : {{{token}}}."))
    elif kind == "rule":
        errors.extend(_validate_condition(data.get("condition"), allow_legacy=allow_legacy))
        events = data.get("events", ["submit"])
        if (
            not isinstance(events, list)
            or not events
            or not all(isinstance(event, str) for event in events)
            or any(event not in ALLOWED_RULE_EVENTS for event in events)
        ):
            errors.append(_error("events", "Un ou plusieurs événements sont invalides."))
        compiled["events"] = events
        actions = data.get("actions", data.get("action"))
        if not isinstance(actions, list) or not actions:
            errors.append(_error("actions", "La règle doit définir au moins une action structurée."))
        else:
            for index, rule_action in enumerate(actions):
                errors.extend(_validate_rule_action(rule_action, f"actions.{index}", allow_legacy=allow_legacy))
    elif kind == "workflow":
        workflow_errors, compiled = _validate_workflow(data, allow_legacy=allow_legacy)
        errors.extend(workflow_errors)
    elif kind == "page":
        audience = data.get("audience", [])
        if not isinstance(audience, list) or not all(isinstance(role, str) and _valid_slug(role) for role in audience):
            errors.append(_error("audience", "L’audience doit contenir des identifiants de rôles."))
        blocks = data.get("blocks", [])
        if not isinstance(blocks, list):
            errors.append(_error("blocks", "Les blocs doivent être une liste."))
        else:
            for index, block in enumerate(blocks):
                if not isinstance(block, dict) or block.get("type") not in ALLOWED_PAGE_BLOCKS:
                    errors.append(_error(f"blocks.{index}.type", "Bloc non autorisé."))
                elif block.get("source") and block["source"] not in ALLOWED_PAGE_SOURCES:
                    errors.append(_error(f"blocks.{index}.source", "Source de données non autorisée."))
                if isinstance(block, dict):
                    links = block.get("links", []) if block.get("type") == "link-list" else [block] if block.get("type") == "button" else []
                    if not isinstance(links, list):
                        errors.append(_error(f"blocks.{index}.links", "Les liens doivent être une liste."))
                        continue
                    for link in links:
                        path = link.get("path", "") if isinstance(link, dict) else ""
                        if not isinstance(path, str) or not path.startswith("/") or path.startswith("//") or "\\" in path or any(ord(char) < 32 for char in path):
                            errors.append(_error(f"blocks.{index}.path", "La destination doit être un chemin interne à NUMA."))
    elif kind == "template":
        template_type = data.get("template_type")
        if template_type is None:
            template_type = "document" if any(key in data for key in ("format", "body", "variables")) else "configuration"
            compiled["template_type"] = template_type
        if template_type == "configuration":
            if data.get("target_kind") not in ALLOWED_TEMPLATE_TARGETS or not isinstance(data.get("payload"), dict):
                errors.append(_error("payload", "Le blueprint doit définir target_kind et payload."))
            else:
                nested = compile_configuration(data["target_kind"], data["payload"], schema_version)
                errors.extend(
                    _error(f"payload.{error['path']}", error["message"])
                    for error in nested.errors
                )
        elif template_type == "document":
            if data.get("format", "docx") not in ALLOWED_TEMPLATE_FORMATS:
                errors.append(_error("format", "Seul le format DOCX est autorisé."))
            variables = data.get("variables", [])
            body = data.get("body", "")
            if (
                not isinstance(variables, list)
                or not all(isinstance(value, str) and FIELD_PATH.fullmatch(value) for value in variables)
                or len(set(variables)) != len(variables)
                or not isinstance(body, str)
            ):
                errors.append(_error("variables", "Le modèle documentaire doit définir body et variables."))
            elif set(TEMPLATE_VARIABLE.findall(body)) - set(variables):
                errors.append(_error("body", "Le document utilise une variable non déclarée."))
        else:
            errors.append(_error("template_type", "Type de template invalide."))
    elif kind == "navigation":
        entries = data.get("entries", [])
        if not isinstance(entries, list):
            errors.append(_error("entries", "Les entrées doivent être une liste."))
        else:
            for index, entry in enumerate(entries):
                if not isinstance(entry, dict) or not isinstance(entry.get("path"), str) or not entry["path"].startswith("/"):
                    errors.append(_error(f"entries.{index}.path", "Le chemin doit être interne à NUMA."))
    elif kind == "signature_policy":
        for key in ("internalValidationEnabled", "graphicSignatureEnabled", "digitalSignatureEnabled"):
            if key in data and not isinstance(data[key], bool):
                errors.append(_error(key, "Cette option doit être booléenne."))
    elif kind in {"branding", "system"}:
        pass
    else:
        errors.append(_error("kind", "Type de configuration non pris en charge."))

    compiled = _canonical(compiled)
    dependencies = _canonical(_dependencies(kind, compiled))
    return CompiledConfiguration(compiled, errors, dependencies, _content_hash(kind, schema_version, compiled))


def validate_configuration(kind: str, data, schema_version: int = 1) -> list[dict]:
    return compile_configuration(kind, data, schema_version).errors
