"""Published configuration exposed to business users without draft access."""
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from .capabilities import Capability, effective_capabilities, effective_role_slugs, has_capability
from .models import AccessGroup, ConfigurationDefinition, ConfigurationVersion, GenericListItem, ListInstance, OrganizationUnit, UserProfile
from .runtime import configuration_data, resolved_bindings
from .services import correspondence_queryset_for


def published(kind, slug):
    return get_object_or_404(
        ConfigurationDefinition.objects.select_related("current_version"),
        kind=kind, slug=slug, active=True,
        current_version__state=ConfigurationVersion.State.PUBLISHED,
    )


@api_view(["GET"])
def published_page(request, slug):
    if not effective_capabilities(request.user):
        raise PermissionDenied("Votre compte ne possède aucun accès métier.")
    definition = published("page", slug)
    data = configuration_data(definition.current_version)
    audience = data.get("audience", [])
    if audience and not set(audience).intersection(effective_role_slugs(request.user)):
        raise PermissionDenied("Cette page est réservée à une autre audience.")
    return Response({"slug": definition.slug, "name": definition.name,
                     "version": definition.current_version.version, "data": data})


@api_view(["GET"])
def published_form(request, slug):
    if not any(has_capability(request.user, capability) for capability in (
        Capability.CORRESPONDENCE_CREATE, Capability.CORRESPONDENCE_READ,
    )):
        raise PermissionDenied("Vous ne pouvez pas consulter ce formulaire.")
    definition = published("list", slug)
    item_id = request.query_params.get("item")
    if item_id:
        item_id = serializers.UUIDField().run_validation(item_id)
        item = get_object_or_404(correspondence_queryset_for(request.user).select_related(
            "configuration_bundle__form_version", "configuration_bundle__workflow_version",
            "list_instance",
        ), pk=item_id, list_instance__definition=definition)
        bundle = item.configuration_bundle
        form_version = bundle.form_version if bundle else None
        workflow_version = bundle.workflow_version if bundle else None
    else:
        instance = ListInstance.objects.filter(
            definition=definition, status__in=[ListInstance.Status.ACTIVE, ListInstance.Status.REOPENED],
        ).select_related("configuration_version").first()
        bindings = resolved_bindings(definition, instance.configuration_version if instance else None)
        form_version = published("form", bindings["form"]).current_version if bindings.get("form") else None
        workflow_version = published("workflow", bindings["workflow"]).current_version if bindings.get("workflow") else None
    return Response({
        "list": definition.slug,
        "form": configuration_data(form_version),
        "form_version": str(form_version.id) if form_version else None,
        "workflow": configuration_data(workflow_version),
    })


@api_view(["GET"])
def field_choices(request, kind):
    if not has_capability(request.user, Capability.CORRESPONDENCE_READ):
        raise PermissionDenied()
    if kind == "organization-unit":
        choices = [{"value": unit.code, "label": f"{unit.code} — {unit.name}"} for unit in OrganizationUnit.objects.filter(active=True)]
    elif kind == "user":
        choices = [{"value": str(profile.user_id), "label": profile.user.get_full_name() or profile.user.username}
                   for profile in UserProfile.objects.filter(active=True).select_related("user")]
    elif kind == "group":
        choices = [{"value": str(group.id), "label": group.name} for group in AccessGroup.objects.filter(active=True)]
    elif kind == "relation":
        definition = published("list", request.query_params.get("list", ""))
        choices = [{"value": str(item.id), "label": item.label}
                   for item in GenericListItem.objects.filter(instance__definition=definition)[:1000]]
    else:
        raise serializers.ValidationError("Type de choix inconnu.")
    return Response({"results": choices})
