import pytest
from django.contrib.auth.models import User

from apps.core.capabilities import Capability
from apps.core.models import (
    AccessRole,
    AuditEvent,
    AuditHead,
    Correspondence,
    CorrespondenceAccessGrant,
    OrganizationUnit,
    UserProfile,
    UserRoleAssignment,
)
from apps.core.services import correspondence_queryset_for


@pytest.mark.django_db
def test_audit_events_are_immutable():
    event = AuditEvent.objects.create(action="test", resource_type="test", resource_id="1")
    event.action = "changed"
    with pytest.raises(ValueError, match="immuables"):
        event.save()
    with pytest.raises(ValueError, match="immuables"):
        event.delete()


@pytest.mark.django_db
def test_audit_events_receive_a_monotonic_sequence_and_update_the_head():
    events = [AuditEvent.objects.create(action=f"test.{index}", resource_type="test", resource_id=str(index)) for index in range(3)]

    assert [event.sequence for event in events] == [1, 2, 3]
    assert events[1].previous_hash == events[0].event_hash
    assert events[2].previous_hash == events[1].event_hash
    head = AuditHead.objects.get(singleton=1)
    assert head.event_hash == events[2].event_hash
    assert head.next_sequence == 4


@pytest.mark.django_db
def test_acl_query_requires_an_explicit_read_capability():
    unit = OrganizationUnit.objects.create(code="ACL", name="Service ACL")
    owner = User.objects.create_user("acl-owner")
    viewer = User.objects.create_user("acl-viewer")
    profile = UserProfile.objects.create(user=viewer, keycloak_subject="acl-viewer")
    role = AccessRole.objects.create(
        slug="acl-test",
        label="ACL test",
        capabilities=[Capability.CORRESPONDENCE_READ, Capability.CORRESPONDENCE_UPDATE],
    )
    UserRoleAssignment.objects.create(profile=profile, role=role)
    item = Correspondence.objects.create(
        registry=Correspondence.Registry.EXTERNAL,
        sender="Expéditeur",
        received_at="2026-08-27",
        subject="Courrier protégé",
        direction=unit,
        responsible_service=unit,
        created_by=owner,
    )
    grant = CorrespondenceAccessGrant.objects.create(
        correspondence=item,
        user=viewer,
        capabilities=["update"],
        created_by=owner,
    )

    assert grant.capabilities == [Capability.CORRESPONDENCE_UPDATE]
    assert list(grant.permission_rows.values_list("capability", flat=True)) == [Capability.CORRESPONDENCE_UPDATE]
    assert not correspondence_queryset_for(viewer).filter(pk=item.pk).exists()

    grant.capabilities = ["read", "update"]
    grant.save(update_fields=["capabilities"])

    assert correspondence_queryset_for(viewer).filter(pk=item.pk).exists()
