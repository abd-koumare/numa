import io
import re

from django.db import transaction
from docx import Document as WordDocument

from .configuration import CURRENT_SCHEMA_VERSION, compile_configuration
from .models import ConfigurationDefinition, ConfigurationVersion
from .runtime import configuration_data


TEMPLATE_VARIABLE = re.compile(r"{{\s*([a-zA-Z][\w.]{0,119})\s*}}")


class TemplateRuntimeError(ValueError):
    pass


def _path_value(context: dict, path: str):
    current = context
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            raise TemplateRuntimeError(f"La variable « {path} » est absente du contexte.")
        current = current[part]
    return current


def render_document_template(version: ConfigurationVersion, context: dict) -> io.BytesIO:
    data = configuration_data(version)
    template_type = data.get("template_type") or (
        "document" if any(key in data for key in ("format", "body", "variables")) else "configuration"
    )
    if (
        version.state not in {ConfigurationVersion.State.PUBLISHED, ConfigurationVersion.State.ARCHIVED}
        or version.definition.kind != ConfigurationDefinition.Kind.TEMPLATE
        or template_type != "document"
    ):
        raise TemplateRuntimeError("Cette version n’est pas un modèle documentaire publié.")
    if not isinstance(context, dict):
        raise TemplateRuntimeError("Le contexte du document doit être un objet.")
    declared = set(data.get("variables", []))
    body = data.get("body", "")
    if not isinstance(body, str) or len(body) > 200_000:
        raise TemplateRuntimeError("Le corps du modèle documentaire est invalide ou trop volumineux.")
    referenced = set(TEMPLATE_VARIABLE.findall(body))
    undeclared = referenced - declared
    if undeclared:
        raise TemplateRuntimeError(f"Variable non déclarée : {sorted(undeclared)[0]}.")

    def replace(match):
        value = _path_value(context, match.group(1))
        return "" if value is None else str(value)

    rendered = TEMPLATE_VARIABLE.sub(replace, body)
    document = WordDocument()
    for paragraph in rendered.splitlines() or [""]:
        document.add_paragraph(paragraph)
    output = io.BytesIO()
    document.save(output)
    output.seek(0)
    return output


@transaction.atomic
def instantiate_configuration_template(
    version: ConfigurationVersion,
    *,
    slug: str,
    name: str,
    description: str,
    actor,
) -> ConfigurationDefinition:
    data = configuration_data(version)
    template_type = data.get("template_type") or (
        "document" if any(key in data for key in ("format", "body", "variables")) else "configuration"
    )
    if (
        version.state not in {ConfigurationVersion.State.PUBLISHED, ConfigurationVersion.State.ARCHIVED}
        or version.definition.kind != ConfigurationDefinition.Kind.TEMPLATE
        or template_type != "configuration"
    ):
        raise TemplateRuntimeError("Cette version n’est pas un blueprint de configuration publié.")
    target_kind = data.get("target_kind")
    payload = data.get("payload")
    compiled = compile_configuration(target_kind, payload, CURRENT_SCHEMA_VERSION)
    if compiled.errors:
        raise TemplateRuntimeError("Le blueprint contient une configuration invalide.")
    definition = ConfigurationDefinition.objects.create(
        kind=target_kind,
        slug=slug,
        name=name,
        description=description,
        created_by=actor,
    )
    ConfigurationVersion.objects.create(
        definition=definition,
        version=1,
        state=ConfigurationVersion.State.DRAFT,
        data=payload,
        schema_version=CURRENT_SCHEMA_VERSION,
        compiled_data=compiled.data,
        dependencies=compiled.dependencies,
        content_hash=compiled.content_hash,
        validation_errors=[],
        created_by=actor,
    )
    return definition
