import re
from collections.abc import Iterable
from datetime import timedelta

from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.db.models import Exists, OuterRef, Q, QuerySet
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from .capabilities import Capability, effective_capabilities, effective_role_slugs, get_profile, has_capability
from .exceptions import PreconditionRequired, StaleVersion, StateConflict
from .models import (
    AccessGroup,
    AccessRole,
    AuditEvent,
    ConfigurationDefinition,
    Correspondence,
    CorrespondenceAccessGrant,
    CorrespondenceAccessGrantCapability,
    DocumentVersion,
    GroupMembership,
    Notification,
    NumberSequence,
    SignatureProof,
    UserProfile,
    UserRoleAssignment,
    WorkflowEvent,
    WorkflowInstance,
    WorkflowTask,
    normalize_grant_capabilities,
)
from .runtime import (
    configuration_data,
    evaluate_condition,
    matching_rule_actions,
    rule_validation_errors,
)
from .signatures import assert_signature_level_available


OWNER_GRANT_CAPABILITIES = [
    Capability.CORRESPONDENCE_READ,
    Capability.CORRESPONDENCE_UPDATE,
    Capability.CORRESPONDENCE_SUBMIT,
    Capability.CORRESPONDENCE_CANCEL,
    Capability.CORRESPONDENCE_REOPEN,
    Capability.CORRESPONDENCE_ARCHIVE,
    Capability.CORRESPONDENCE_MANAGE_ACL,
    Capability.DOCUMENT_UPLOAD,
    Capability.DOCUMENT_DOWNLOAD,
]
SERVICE_GRANT_CAPABILITIES = [
    Capability.CORRESPONDENCE_READ,
    Capability.CORRESPONDENCE_UPDATE,
    Capability.CORRESPONDENCE_SUBMIT,
    Capability.DOCUMENT_UPLOAD,
    Capability.DOCUMENT_DOWNLOAD,
]
WORKFLOW_GRANT_CAPABILITIES = [
    Capability.CORRESPONDENCE_READ,
    Capability.CORRESPONDENCE_VALIDATE,
    Capability.CORRESPONDENCE_REJECT,
    Capability.CORRESPONDENCE_SIGN,
    Capability.DOCUMENT_DOWNLOAD,
]


def json_safe(value):
    import json

    return json.loads(json.dumps(value, cls=DjangoJSONEncoder))


def request_context(request) -> dict:
    if request is None:
        return {}
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    ip_address = forwarded.split(",", 1)[0].strip() if forwarded else request.META.get("REMOTE_ADDR")
    return {
        "request_id": getattr(request, "request_id", "") or request.headers.get("X-Request-ID", ""),
        "ip_address": ip_address or None,
    }


def record_audit(*, actor, action: str, resource_type: str, resource_id, request=None, metadata=None, before=None, after=None):
    event = AuditEvent.objects.create(
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id),
        metadata=json_safe(metadata or {}),
        before=json_safe(before) if before is not None else None,
        after=json_safe(after) if after is not None else None,
        **request_context(request),
    )
    from .models import WebhookDelivery, WebhookEndpoint

    delivery_ids = []
    payload = {
        "id": str(event.id),
        "event": action,
        "resource_type": resource_type,
        "resource_id": str(resource_id),
        "occurred_at": event.created_at.isoformat(),
        "actor": event.actor_snapshot,
        "metadata": event.metadata,
        "before": event.before,
        "after": event.after,
    }
    for endpoint in WebhookEndpoint.objects.filter(active=True).only("id", "events"):
        if action in (endpoint.events or []) or "*" in (endpoint.events or []):
            delivery = WebhookDelivery.objects.create(endpoint=endpoint, event=action, payload=payload)
            delivery_ids.append(str(delivery.id))
    if delivery_ids:
        def enqueue_deliveries():
            from .tasks import deliver_webhook

            for delivery_id in delivery_ids:
                deliver_webhook.delay(delivery_id)

        transaction.on_commit(enqueue_deliveries)
    return event


def sync_role_assignments(profile: UserProfile, role_slugs: Iterable[str], source=UserRoleAssignment.Source.KEYCLOAK):
    role_slugs = {slug for slug in role_slugs if slug}
    valid_roles = AccessRole.objects.filter(slug__in=role_slugs, active=True)
    profile.role_assignments.filter(source=source).exclude(role__in=valid_roles).delete()
    for role in valid_roles:
        UserRoleAssignment.objects.get_or_create(profile=profile, role=role, source=source)


def service_group_for(unit) -> AccessGroup:
    group, _ = AccessGroup.objects.get_or_create(
        source=AccessGroup.Source.LOCAL,
        external_id=f"service:{unit.pk}",
        defaults={
            "name": f"NUMA-{unit.code}",
            "description": f"Membres du service {unit.name}",
            "organization_unit": unit,
        },
    )
    if group.organization_unit_id != unit.pk:
        group.organization_unit = unit
        group.save(update_fields=["organization_unit", "updated_at"])
    return group


def sync_service_membership(profile: UserProfile):
    profile.group_memberships.filter(group__source=AccessGroup.Source.LOCAL, group__external_id__startswith="service:").delete()
    if profile.organization_unit_id:
        group = service_group_for(profile.organization_unit)
        GroupMembership.objects.get_or_create(profile=profile, group=group, defaults={"source": GroupMembership.Source.MANUAL})


def sync_directory_memberships(profile: UserProfile, external_groups: Iterable[str]):
    external_groups = {str(group).strip() for group in external_groups if str(group).strip()}
    profile.group_memberships.filter(group__source=AccessGroup.Source.DIRECTORY).exclude(group__external_id__in=external_groups).delete()
    for external_id in external_groups:
        group, _ = AccessGroup.objects.get_or_create(
            source=AccessGroup.Source.DIRECTORY,
            external_id=external_id,
            defaults={"name": external_id.rsplit("/", 1)[-1] or external_id, "description": "Groupe synchronisé depuis l’annuaire"},
        )
        GroupMembership.objects.get_or_create(profile=profile, group=group, defaults={"source": GroupMembership.Source.DIRECTORY})


def grant_default_correspondence_access(item: Correspondence, actor):
    CorrespondenceAccessGrant.objects.get_or_create(
        correspondence=item,
        user=actor,
        source=CorrespondenceAccessGrant.Source.OWNER,
        defaults={"capabilities": OWNER_GRANT_CAPABILITIES, "created_by": actor},
    )
    service_group = service_group_for(item.responsible_service)
    CorrespondenceAccessGrant.objects.get_or_create(
        correspondence=item,
        group=service_group,
        source=CorrespondenceAccessGrant.Source.SERVICE,
        defaults={"capabilities": SERVICE_GRANT_CAPABILITIES, "created_by": actor},
    )
    profile = get_profile(actor)
    if profile and profile.organization_unit_id == item.responsible_service_id:
        GroupMembership.objects.get_or_create(profile=profile, group=service_group)


def correspondence_queryset_for(user, queryset: QuerySet | None = None):
    queryset = queryset if queryset is not None else Correspondence.objects.all()
    profile = get_profile(user)
    if profile is None or not has_capability(user, Capability.CORRESPONDENCE_READ):
        return queryset.none()
    if has_capability(user, Capability.CORRESPONDENCE_READ_ALL):
        return queryset
    group_ids = profile.group_memberships.filter(group__active=True).values_list("group_id", flat=True)
    now = timezone.now()
    readable_grants = CorrespondenceAccessGrantCapability.objects.filter(
        grant__correspondence_id=OuterRef("pk"),
        capability__in=[Capability.CORRESPONDENCE_READ, "*"],
    ).filter(
        Q(grant__user=user) | Q(grant__group_id__in=group_ids),
    ).filter(
        Q(grant__expires_at__isnull=True) | Q(grant__expires_at__gt=now),
    )
    return queryset.annotate(_numa_acl_read=Exists(readable_grants)).filter(
        Q(created_by=user) | Q(_numa_acl_read=True),
    )


def _grant_matches(grant_capabilities: Iterable[str], capability: str) -> bool:
    values = set(normalize_grant_capabilities(grant_capabilities))
    return capability in values or "*" in values


def has_correspondence_capability(user, item: Correspondence, capability: str) -> bool:
    if not has_capability(user, capability):
        return False
    if has_capability(user, Capability.CORRESPONDENCE_READ_ALL):
        return True
    profile = get_profile(user)
    if profile is None:
        return False
    if item.created_by_id == user.id and _grant_matches(OWNER_GRANT_CAPABILITIES, capability):
        return True
    group_ids = profile.group_memberships.filter(group__active=True).values_list("group_id", flat=True)
    now = timezone.now()
    return item.access_grants.filter(
        Q(user=user) | Q(group_id__in=group_ids),
    ).filter(
        Q(expires_at__isnull=True) | Q(expires_at__gt=now),
        permission_rows__capability__in=[capability, "*"],
    ).exists()


def assert_if_match(request, item: Correspondence):
    expected = request.headers.get("If-Match")
    if expected is None:
        raise PreconditionRequired()
    normalized = expected.strip().removeprefix("W/").strip('"')
    if normalized != str(item.row_version):
        raise StaleVersion()


def _numbering_settings(item: Correspondence | None = None):
    if item is not None and item.configuration_bundle_id:
        pinned = configuration_data(item.configuration_bundle.numbering_version)
        if pinned:
            return pinned
    definition = ConfigurationDefinition.objects.select_related("current_version").filter(
        kind=ConfigurationDefinition.Kind.NUMBERING,
        slug="correspondence-numbering",
        active=True,
    ).first()
    if definition and definition.current_version:
        return definition.current_version.data
    return {
        "format": "{REGISTRE}-{SERVICE}-{SEQUENCE:0000}/{ANNEE}",
        "counterScope": "service-year",
        "sharedAcrossRegistries": False,
    }


def _format_reference_values(*, registry, service_code, direction_code, received_at, username, number, settings) -> str:
    template = settings.get("format") or "{REGISTRE}-{SERVICE}-{SEQUENCE:0000}/{ANNEE}"

    def replace_sequence(match):
        padding = match.group(1)
        return str(number).zfill(len(padding)) if padding else str(number)

    value = re.sub(r"\{SEQUENCE(?::(0+))?\}", replace_sequence, template)
    replacements = {
        "{ANNEE}": str(received_at.year),
        "{MOIS}": f"{received_at.month:02d}",
        "{JOUR}": f"{received_at.day:02d}",
        "{SERVICE}": service_code,
        "{DIRECTION}": direction_code,
        "{TYPE}": "COURRIER",
        "{LISTE}": "COURRIERS",
        "{REGISTRE}": "INT" if registry == Correspondence.Registry.INTERNAL else "EXT",
        "{SITE}": "SIEGE",
        "{UTILISATEUR}": username.upper()[:12],
    }
    for token, replacement in replacements.items():
        value = value.replace(token, replacement)
    if re.search(r"\{[^}]+\}", value):
        raise serializers.ValidationError({"numbering": "Le format publié contient une variable inconnue."})
    return value[:80]


def _format_reference(item: Correspondence, number: int, settings: dict) -> str:
    return _format_reference_values(
        registry=item.registry,
        service_code=item.responsible_service.code,
        direction_code=item.direction.code,
        received_at=item.received_at,
        username=item.created_by.username,
        number=number,
        settings=settings,
    )


def _number_sequence_scope(*, registry, service_code, direction_code, received_at, settings):
    shared = bool(settings.get("sharedAcrossRegistries"))
    registry_bucket = Correspondence.Registry.INTERNAL if shared else registry
    scope = settings.get("counterScope", "service-year")
    if scope == "global":
        return registry_bucket, "GLOBAL", 0, "global"
    if scope == "year":
        return registry_bucket, "GLOBAL", received_at.year, "year"
    if scope == "direction-year":
        return registry_bucket, direction_code, received_at.year, "direction-year"
    return registry_bucket, service_code, received_at.year, "service-year"


def preview_reference(*, registry, service_code, direction_code, received_at, username, sequence=None, numbering_settings=None):
    settings = numbering_settings or _numbering_settings()
    registry_bucket, sequence_service, year, scope_key = _number_sequence_scope(
        registry=registry,
        service_code=service_code,
        direction_code=direction_code,
        received_at=received_at,
        settings=settings,
    )
    if sequence is None:
        sequence = NumberSequence.objects.filter(
            registry=registry_bucket,
            service_code=sequence_service,
            year=year,
            scope_key=scope_key,
        ).values_list("next_value", flat=True).first() or 1
    reference = _format_reference_values(
        registry=registry,
        service_code=service_code,
        direction_code=direction_code,
        received_at=received_at,
        username=username,
        number=sequence,
        settings=settings,
    )
    return {
        "reference": reference,
        "sequence": sequence,
        "scope_key": scope_key,
        "available": not Correspondence.objects.filter(reference=reference).exists(),
    }


def assign_reference(item: Correspondence):
    if item.reference:
        return
    settings = _numbering_settings(item)
    registry_bucket, service_code, year, scope_key = _number_sequence_scope(
        registry=item.registry,
        service_code=item.responsible_service.code,
        direction_code=item.direction.code,
        received_at=item.received_at,
        settings=settings,
    )
    sequence, _ = NumberSequence.objects.select_for_update().get_or_create(
        registry=registry_bucket,
        service_code=service_code,
        year=year,
        scope_key=scope_key,
        defaults={"next_value": 1},
    )
    item.reference = _format_reference(item, sequence.next_value, settings)
    sequence.next_value += 1
    sequence.save(update_fields=["next_value"])


def _select_validator(item: Correspondence, actor):
    candidates = UserProfile.objects.select_related("user").filter(active=True, user__is_active=True)
    same_service = candidates.filter(organization_unit=item.responsible_service)
    for profile in list(same_service) + list(candidates.exclude(organization_unit=item.responsible_service)):
        if Capability.CORRESPONDENCE_VALIDATE in effective_capabilities(profile.user):
            return profile.user
    if Capability.CORRESPONDENCE_VALIDATE in effective_capabilities(actor):
        return actor
    return None


def _select_workflow_actor(item: Correspondence, selector: str, fallback_actor):
    if selector == "creator":
        return item.created_by, None
    if selector in {"responsible-service", "system"}:
        return None, service_group_for(item.responsible_service)
    if selector.startswith("user:"):
        identity = selector.removeprefix("user:")
        profile = UserProfile.objects.select_related("user").filter(
            Q(user__username=identity) | Q(keycloak_subject=identity),
            active=True,
            user__is_active=True,
        ).first()
        if profile:
            return profile.user, None
    if selector.startswith("group:"):
        identity = selector.removeprefix("group:")
        group = AccessGroup.objects.filter(
            Q(external_id=identity) | Q(name=identity),
            active=True,
        ).first()
        if group:
            return None, group
    if selector.startswith("role:"):
        role = selector.removeprefix("role:")
        candidates = UserProfile.objects.select_related("user").filter(active=True, user__is_active=True)
        ordered = list(candidates.filter(organization_unit=item.responsible_service))
        ordered.extend(candidates.exclude(organization_unit=item.responsible_service))
        for profile in ordered:
            if role in effective_role_slugs(profile.user):
                return profile.user, None
    validator = _select_validator(item, fallback_actor)
    if validator:
        return validator, None
    return None, service_group_for(item.responsible_service)


def _workflow_payload(item: Correspondence, matched_actions=None) -> dict:
    version = item.configuration_bundle.workflow_version if item.configuration_bundle_id else None
    data = configuration_data(version)
    steps = [dict(step) for step in data.get("steps", []) if isinstance(step, dict) and step.get("key")]
    if not steps:
        steps = [{
            "key": "validation",
            "label": "Valider le courrier",
            "kind": "validation",
            "actor": "role:validateur",
            "due_days": 2,
        }]
    transitions = [dict(value) for value in data.get("transitions", []) if isinstance(value, dict)]
    if not transitions:
        transitions = [
            {
                "key": f"{steps[index]['key']}-complete",
                "from": steps[index]["key"],
                "to": steps[index + 1]["key"],
                "action": "complete",
            }
            for index in range(len(steps) - 1)
        ]

    injected_versions = []
    for version, action in matched_actions or []:
        if action.get("type") != "add_workflow_step" or not isinstance(action.get("step"), dict):
            continue
        step = dict(action["step"])
        if not step.get("key") or any(existing["key"] == step["key"] for existing in steps):
            continue
        default_after = next(
            (candidate["key"] for candidate in reversed(steps) if candidate.get("kind") in {"validation", "approval"}),
            steps[0]["key"],
        )
        after = action.get("after", default_after)
        insert_at = next((index + 1 for index, candidate in enumerate(steps) if candidate["key"] == after), len(steps))
        steps.insert(insert_at, step)
        outgoing = [transition for transition in transitions if transition.get("from") == after]
        for transition in outgoing:
            transition["from"] = step["key"]
        transitions.append({
            "key": f"{after}-{step['key']}",
            "from": after,
            "to": step["key"],
            "action": "complete",
        })
        injected_versions.append(str(version.id))
    return {
        "steps": steps,
        "transitions": transitions,
        "injected_rule_versions": injected_versions,
        "cycle": 1,
    }


def _workflow_step(context: dict, key: str) -> dict | None:
    return next((step for step in context.get("steps", []) if step.get("key") == key), None)


def _next_workflow_step(workflow: WorkflowInstance, item: Correspondence, action: str) -> dict | None:
    current = workflow.current_step
    values = _correspondence_runtime_values(item)
    action_aliases = {
        "validate": {"validate", "approve", "complete"},
        "sign": {"sign", "signature", "complete"},
        "archive": {"archive", "complete"},
    }.get(action, {action, "complete"})
    for _ in range(32):
        transitions = [
            transition
            for transition in workflow.context.get("transitions", [])
            if transition.get("from") == current
            and transition.get("action", "complete") in action_aliases
            and (
                transition.get("condition") is None
                or evaluate_condition(transition["condition"], values)
            )
        ]
        if not transitions:
            return None
        current = transitions[0].get("to")
        step = _workflow_step(workflow.context, current)
        if step is None:
            return None
        if step.get("kind") not in {"preparation", "automation"}:
            return step
    raise StateConflict("Le workflow dépasse la limite de 32 transitions automatiques.")


def _grant_workflow_task_access(item: Correspondence, task: WorkflowTask, actor):
    if task.assignee_id:
        CorrespondenceAccessGrant.objects.get_or_create(
            correspondence=item,
            user=task.assignee,
            source=CorrespondenceAccessGrant.Source.WORKFLOW,
            defaults={"capabilities": WORKFLOW_GRANT_CAPABILITIES, "created_by": actor},
        )
    elif task.assignee_group_id:
        CorrespondenceAccessGrant.objects.update_or_create(
            correspondence=item,
            group=task.assignee_group,
            source=CorrespondenceAccessGrant.Source.WORKFLOW,
            defaults={"capabilities": WORKFLOW_GRANT_CAPABILITIES, "created_by": actor},
        )


def _create_configured_task(workflow: WorkflowInstance, item: Correspondence, step: dict, actor) -> WorkflowTask:
    kind = {
        "validation": WorkflowTask.Kind.VALIDATION,
        "approval": WorkflowTask.Kind.VALIDATION,
        "signature": WorkflowTask.Kind.SIGNATURE,
    }.get(step.get("kind"), WorkflowTask.Kind.PROCESSING)
    assignee, assignee_group = _select_workflow_actor(item, step.get("actor", "system"), actor)
    due_days = step.get("due_days", 0)
    cycle = int(workflow.context.get("cycle", 1))
    task_key = step["key"] if cycle == 1 else f"{step['key']}#{cycle}"
    task, _ = WorkflowTask.objects.get_or_create(
        workflow=workflow,
        step_key=task_key,
        defaults={
            "label": step.get("label") or step["key"].replace("-", " ").title(),
            "kind": kind,
            "assignee": assignee,
            "assignee_group": assignee_group,
            "due_at": timezone.now() + timedelta(days=due_days) if due_days else None,
        },
    )
    _grant_workflow_task_access(item, task, actor)
    if task.assignee_id and task.assignee_id != actor.id:
        Notification.objects.get_or_create(
            recipient=task.assignee,
            kind=Notification.Kind.SIGNATURE if kind == WorkflowTask.Kind.SIGNATURE else Notification.Kind.VALIDATION,
            title="Signature demandée" if kind == WorkflowTask.Kind.SIGNATURE else "Validation demandée",
            path=f"/courriers/{item.registry}s/{item.id}",
            data={"correspondence_id": str(item.id), "task_id": str(task.id)},
            defaults={
                "detail": f"{item.reference or 'Brouillon'} · {item.subject}",
                "email_requested": True,
            },
        )
    return task


def _first_workflow_step(context: dict) -> dict | None:
    return next(
        (step for step in context.get("steps", []) if step.get("kind") not in {"preparation", "automation"}),
        None,
    )


def start_validation_workflow(item: Correspondence, actor, matched_actions=None):
    context = _workflow_payload(item, matched_actions)
    first_step = _first_workflow_step(context)
    if first_step is None:
        raise StateConflict("Le workflow épinglé ne contient aucune étape exécutable.")
    definition_version = item.configuration_bundle.workflow_version if item.configuration_bundle_id else None
    workflow, created = WorkflowInstance.objects.get_or_create(
        correspondence=item,
        defaults={
            "definition_version": definition_version,
            "status": WorkflowInstance.Status.RUNNING,
            "current_step": first_step["key"],
            "context": context,
            "started_by": actor,
        },
    )
    if not created:
        if workflow.status != WorkflowInstance.Status.RUNNING:
            context["cycle"] = int((workflow.context or {}).get("cycle", 1)) + 1
            workflow.status = WorkflowInstance.Status.RUNNING
            workflow.completed_at = None
            workflow.definition_version = definition_version
            workflow.context = context
            workflow.current_step = first_step["key"]
            workflow.save(update_fields=[
                "status",
                "completed_at",
                "definition_version",
                "context",
                "current_step",
            ])
        else:
            if workflow.definition_version_id is None and definition_version:
                workflow.definition_version = definition_version
            if not workflow.context:
                workflow.context = context
            if not workflow.current_step:
                workflow.current_step = first_step["key"]
            workflow.save(update_fields=["definition_version", "context", "current_step"])
    step = _workflow_step(workflow.context, workflow.current_step) or first_step
    task = _create_configured_task(workflow, item, step, actor)
    return workflow, task


def _complete_current_task(workflow: WorkflowInstance, actor, result: str, comment: str = "") -> WorkflowTask | None:
    cycle = int((workflow.context or {}).get("cycle", 1))
    task_key = workflow.current_step if cycle == 1 else f"{workflow.current_step}#{cycle}"
    task = workflow.tasks.filter(
        step_key=task_key,
        status__in=[WorkflowTask.Status.TODO, WorkflowTask.Status.IN_PROGRESS],
    ).first()
    if task:
        task.status = {
            "complete": WorkflowTask.Status.COMPLETED,
            "reject": WorkflowTask.Status.REJECTED,
            "cancel": WorkflowTask.Status.CANCELLED,
        }[result]
        task.comment = comment
        task.completed_by = actor
        task.completed_at = timezone.now()
        task.save(update_fields=["status", "comment", "completed_by", "completed_at"])
    return task


def _advance_workflow(workflow: WorkflowInstance, item: Correspondence, actor, action: str, comment: str = ""):
    task = _complete_current_task(workflow, actor, "complete", comment)
    next_step = _next_workflow_step(workflow, item, action)
    if next_step is None:
        workflow.status = WorkflowInstance.Status.COMPLETED
        workflow.current_step = item.status
        workflow.completed_at = timezone.now()
        workflow.save(update_fields=["status", "current_step", "completed_at"])
        return task
    workflow.current_step = next_step["key"]
    workflow.save(update_fields=["current_step"])
    _create_configured_task(workflow, item, next_step, actor)
    return task


def _terminate_workflow(workflow: WorkflowInstance, actor, result: str, target_status: str, comment: str = ""):
    task = _complete_current_task(workflow, actor, result, comment)
    workflow.status = {
        "reject": WorkflowInstance.Status.REJECTED,
        "cancel": WorkflowInstance.Status.CANCELLED,
    }[result]
    workflow.current_step = target_status
    workflow.completed_at = timezone.now()
    workflow.save(update_fields=["status", "current_step", "completed_at"])
    return task


def _assert_workflow_transition(workflow: WorkflowInstance | None, action: str):
    if workflow is None or workflow.status != WorkflowInstance.Status.RUNNING:
        return
    step = _workflow_step(workflow.context, workflow.current_step)
    if step is None:
        raise StateConflict("L’étape courante du workflow épinglé est introuvable.")
    kind = step.get("kind")
    if action in {"validate", "reject"} and kind not in {"validation", "approval"}:
        raise StateConflict("L’étape courante du workflow n’accepte pas une décision de validation.")
    if action == "archive" and kind != "archive" and not bool(step.get("optional")):
        raise StateConflict("L’étape courante du workflow doit être terminée avant l’archivage.")


def _assert_workflow_signature(workflow: WorkflowInstance | None):
    if workflow is None or workflow.status != WorkflowInstance.Status.RUNNING:
        return
    step = _workflow_step(workflow.context, workflow.current_step)
    if step is None:
        raise StateConflict("L’étape courante du workflow épinglé est introuvable.")
    if step.get("kind") != "signature":
        raise StateConflict("Le workflow épinglé n’est pas actuellement à l’étape de signature.")


def _rule_notification_recipients(item: Correspondence, selector: str, actor):
    assignee, group = _select_workflow_actor(item, selector, actor)
    if assignee:
        return [assignee]
    if group:
        return [
            profile.user
            for profile in UserProfile.objects.select_related("user").filter(
                group_memberships__group=group,
                active=True,
                user__is_active=True,
            ).distinct()
        ]
    return []


def apply_rule_side_effects(
    item: Correspondence,
    event: str,
    actor,
    *,
    request=None,
    workflow: WorkflowInstance | None = None,
    matches=None,
):
    if matches is None:
        matches = (
            matching_rule_actions(
                item.configuration_bundle,
                event,
                _correspondence_runtime_values(item),
            )
            if item.configuration_bundle_id
            else []
        )
    applied = []
    for index, (version, action) in enumerate(matches):
        action_type = action.get("type")
        metadata = {"rule_version_id": str(version.id), "action": action_type}
        if action_type == "restrict_to_responsible_service":
            metadata["removed_manual_grants"] = item.access_grants.filter(
                source=CorrespondenceAccessGrant.Source.MANUAL,
            ).delete()[0]
        elif action_type == "notify":
            recipients = _rule_notification_recipients(
                item,
                action.get("recipient", "responsible-service"),
                actor,
            )
            for recipient in recipients:
                Notification.objects.create(
                    recipient=recipient,
                    kind=Notification.Kind.SYSTEM,
                    title=action.get("title") or "Règle métier déclenchée",
                    detail=action.get("detail") or f"{item.reference or 'Brouillon'} · {item.subject}",
                    path=f"/courriers/{item.registry}s/{item.id}",
                    data={"correspondence_id": str(item.id), "rule_version_id": str(version.id)},
                    email_requested=bool(action.get("email", False)),
                )
            metadata["recipient_count"] = len(recipients)
        elif action_type == "assign_task" and workflow:
            step = {
                "key": action.get("key") or f"rule-{version.version}-{index}",
                "label": action.get("label") or "Traiter la règle métier",
                "kind": action.get("kind", "processing"),
                "actor": action.get("actor", "responsible-service"),
                "due_days": action.get("due_days", 0),
            }
            task = _create_configured_task(workflow, item, step, actor)
            metadata["task_id"] = str(task.id)
        elif action_type in {
            "require_field",
            "require_attachment",
            "add_workflow_step",
        }:
            pass
        else:
            continue
        applied.append(metadata)
    if applied:
        record_audit(
            actor=actor,
            action=f"correspondence.rules.{event}",
            resource_type="correspondence",
            resource_id=item.id,
            request=request,
            metadata={"applied": applied},
        )
    return applied


TRANSITIONS = {
    "submit": ({Correspondence.Status.DRAFT, Correspondence.Status.TO_PROCESS}, Correspondence.Status.IN_VALIDATION, Capability.CORRESPONDENCE_SUBMIT),
    "validate": ({Correspondence.Status.IN_VALIDATION}, Correspondence.Status.VALIDATED, Capability.CORRESPONDENCE_VALIDATE),
    "reject": ({Correspondence.Status.IN_VALIDATION}, Correspondence.Status.REJECTED, Capability.CORRESPONDENCE_REJECT),
    "cancel": ({Correspondence.Status.DRAFT, Correspondence.Status.TO_PROCESS, Correspondence.Status.IN_VALIDATION, Correspondence.Status.REJECTED}, Correspondence.Status.CANCELLED, Capability.CORRESPONDENCE_CANCEL),
    "reopen": ({Correspondence.Status.REJECTED, Correspondence.Status.CANCELLED, Correspondence.Status.ARCHIVED}, Correspondence.Status.TO_PROCESS, Capability.CORRESPONDENCE_REOPEN),
    "archive": ({Correspondence.Status.VALIDATED, Correspondence.Status.SIGNED, Correspondence.Status.CANCELLED}, Correspondence.Status.ARCHIVED, Capability.CORRESPONDENCE_ARCHIVE),
}


def _correspondence_runtime_values(item: Correspondence) -> dict:
    return {
        **(item.custom_data or {}),
        "sender": item.sender,
        "origin_reference": item.origin_reference,
        "received_at": item.received_at.isoformat(),
        "channel": item.channel,
        "subject": item.subject,
        "direction": item.direction.code,
        "responsible_service": item.responsible_service.code,
        "priority": item.priority,
        "confidentiality": item.confidentiality,
        "due_at": item.due_at.isoformat() if item.due_at else None,
        "summary": item.summary,
        "status": item.status,
    }


@transaction.atomic
def transition_correspondence(correspondence: Correspondence, action: str, actor, request=None, comment=""):
    if action not in TRANSITIONS:
        raise serializers.ValidationError({"action": "Transition inconnue."})
    allowed_from, target_status, capability = TRANSITIONS[action]
    item = Correspondence.objects.select_for_update(of=("self",)).select_related(
        "direction",
        "responsible_service",
        "created_by",
        "configuration_bundle__numbering_version",
    ).get(pk=correspondence.pk)
    assert_if_match(request, item)
    if not has_correspondence_capability(actor, item, capability):
        raise PermissionDenied("Vous n’êtes pas habilité à effectuer cette transition.")
    if item.status not in allowed_from:
        raise StateConflict(f"La transition « {action} » n’est pas possible depuis l’état « {item.get_status_display()} ».")
    rule_event = "submit" if action == "submit" else "archive" if action == "archive" else "transition"
    matched_actions = (
        matching_rule_actions(
            item.configuration_bundle,
            rule_event,
            _correspondence_runtime_values(item),
        )
        if item.configuration_bundle_id
        else []
    )
    has_clean_document = item.documents.filter(scan_status=DocumentVersion.ScanStatus.CLEAN).exists()
    if item.configuration_bundle_id:
        rule_errors = rule_validation_errors(
            item.configuration_bundle,
            rule_event,
            _correspondence_runtime_values(item),
            has_attachment=has_clean_document,
        )
        if rule_errors:
            raise serializers.ValidationError({error["path"]: error["message"] for error in rule_errors})
    workflow = WorkflowInstance.objects.select_for_update().filter(correspondence=item).first()
    _assert_workflow_transition(workflow, action)
    if action == "submit":
        if not has_clean_document:
            raise serializers.ValidationError({"documents": "Au moins un document analysé et sain est obligatoire."})
        assign_reference(item)
    before = {"status": item.status, "reference": item.reference, "row_version": item.row_version}
    previous = item.status
    item.status = target_status
    item.row_version += 1
    update_fields = ["reference", "status", "row_version", "updated_at"]
    if action == "archive":
        item.archived_at = timezone.now()
        update_fields.append("archived_at")
    if action == "reopen":
        item.reopened_at = timezone.now()
        item.archived_at = None
        update_fields.extend(["reopened_at", "archived_at"])
    item.save(update_fields=update_fields)
    task = None
    if action == "submit":
        workflow, task = start_validation_workflow(item, actor, matched_actions)
    else:
        if workflow:
            if action == "validate":
                task = _advance_workflow(workflow, item, actor, action, comment)
                next_step = _workflow_step(workflow.context, workflow.current_step)
                if (
                    workflow.status == WorkflowInstance.Status.RUNNING
                    and next_step
                    and next_step.get("kind") in {"validation", "approval"}
                ):
                    # Further approvals must remain actionable before signing.
                    item.status = Correspondence.Status.IN_VALIDATION
                    item.save(update_fields=["status"])
            elif action in {"reject", "cancel"}:
                task = _terminate_workflow(workflow, actor, action, target_status, comment)
            elif action == "archive":
                task = _complete_current_task(workflow, actor, "complete", comment)
                workflow.status = WorkflowInstance.Status.COMPLETED
                workflow.current_step = target_status
                workflow.completed_at = timezone.now()
                workflow.save(update_fields=["status", "current_step", "completed_at"])
    apply_rule_side_effects(
        item,
        rule_event,
        actor,
        request=request,
        workflow=workflow,
        matches=matched_actions,
    )
    WorkflowEvent.objects.create(
        correspondence=item,
        workflow=workflow,
        task=task,
        event=action,
        from_status=previous,
        to_status=item.status,
        actor=actor,
        comment=comment,
        metadata={
            "workflow_version_id": str(workflow.definition_version_id) if workflow and workflow.definition_version_id else None,
            "task_step": task.step_key if task else None,
        },
    )
    record_audit(
        actor=actor,
        action=f"correspondence.{action}",
        resource_type="correspondence",
        resource_id=item.id,
        request=request,
        metadata={"comment": comment},
        before=before,
        after={"status": item.status, "reference": item.reference, "row_version": item.row_version},
    )
    if action in {"validate", "reject", "cancel"} and item.created_by_id != actor.id:
        Notification.objects.create(
            recipient=item.created_by,
            kind=Notification.Kind.VALIDATION,
            title=f"Courrier {item.get_status_display().lower()}",
            detail=f"{item.reference} · {item.subject}",
            path=f"/courriers/{item.registry}s/{item.id}",
            data={"correspondence_id": str(item.id)},
            email_requested=True,
        )
    return item


@transaction.atomic
def sign_correspondence(correspondence, actor, document_version, level, request=None, graphic_mark=""):
    item = Correspondence.objects.select_for_update(of=("self",)).select_related(
        "created_by",
        "direction",
        "responsible_service",
        "configuration_bundle__signature_policy_version",
    ).get(pk=correspondence.pk)
    assert_if_match(request, item)
    if not has_correspondence_capability(actor, item, Capability.CORRESPONDENCE_SIGN):
        raise PermissionDenied("Vous n’êtes pas habilité à signer ce courrier.")
    if item.status != Correspondence.Status.VALIDATED:
        raise StateConflict("Seul un courrier validé peut être signé.")
    if document_version.correspondence_id != item.id or document_version.scan_status != DocumentVersion.ScanStatus.CLEAN:
        raise serializers.ValidationError({"document_version_id": "Sélectionnez une version saine de ce courrier."})
    workflow = WorkflowInstance.objects.select_for_update().filter(correspondence=item).first()
    _assert_workflow_signature(workflow)
    policy_version = item.configuration_bundle.signature_policy_version if item.configuration_bundle_id else None
    provider = assert_signature_level_available(level, policy_version)
    if level == SignatureProof.Level.GRAPHIC and not graphic_mark.strip():
        raise serializers.ValidationError({"graphic_mark": "La marque graphique est obligatoire."})
    matched_actions = (
        matching_rule_actions(
            item.configuration_bundle,
            "sign",
            _correspondence_runtime_values(item),
        )
        if item.configuration_bundle_id
        else []
    )
    rule_errors = (
        rule_validation_errors(
            item.configuration_bundle,
            "sign",
            _correspondence_runtime_values(item),
            has_attachment=True,
        )
        if item.configuration_bundle_id
        else []
    )
    if rule_errors:
        raise serializers.ValidationError({error["path"]: error["message"] for error in rule_errors})
    now = timezone.now()
    profile = get_profile(actor)
    proof = SignatureProof.objects.create(
        correspondence=item,
        document_version=document_version,
        level=level,
        status=SignatureProof.Status.VERIFIED,
        signer=actor,
        signer_role=profile.title if profile else "",
        graphic_mark=graphic_mark,
        document_hash=document_version.sha256,
        evidence={
            "identity_subject": profile.keycloak_subject if profile else "",
            "authenticated_at": now.isoformat(),
            "row_version": item.row_version,
            "policy_version_id": str(policy_version.id) if policy_version else None,
            "provider": provider,
        },
        policy_version=policy_version,
        provider=provider,
        ip_address=request_context(request).get("ip_address"),
        signed_at=now,
    )
    previous = item.status
    item.status = Correspondence.Status.SIGNED
    item.row_version += 1
    item.save(update_fields=["status", "row_version", "updated_at"])
    task = None
    if workflow and workflow.status == WorkflowInstance.Status.RUNNING:
        current_step = _workflow_step(workflow.context, workflow.current_step)
        if current_step and current_step.get("kind") == "signature":
            task = _advance_workflow(workflow, item, actor, "sign")
    apply_rule_side_effects(
        item,
        "sign",
        actor,
        request=request,
        workflow=workflow,
        matches=matched_actions,
    )
    WorkflowEvent.objects.create(
        correspondence=item,
        workflow=workflow,
        task=task,
        event="sign",
        from_status=previous,
        to_status=item.status,
        actor=actor,
        metadata={
            "proof_id": str(proof.id),
            "level": level,
            "document_hash": document_version.sha256,
            "policy_version_id": str(policy_version.id) if policy_version else None,
            "provider": provider,
            "task_step": task.step_key if task else None,
        },
    )
    record_audit(
        actor=actor,
        action="correspondence.sign",
        resource_type="correspondence",
        resource_id=item.id,
        request=request,
        metadata={
            "proof_id": str(proof.id),
            "level": level,
            "document_hash": document_version.sha256,
            "policy_version_id": str(policy_version.id) if policy_version else None,
            "provider": provider,
        },
        before={"status": previous, "row_version": item.row_version - 1},
        after={"status": item.status, "row_version": item.row_version},
    )
    return item, proof
