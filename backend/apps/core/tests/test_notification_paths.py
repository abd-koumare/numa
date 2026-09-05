from importlib import import_module
from types import SimpleNamespace

import pytest
from django.apps import apps
from django.contrib.auth.models import User
from django.db import connection
from django.utils import timezone

from apps.core.models import Correspondence, Notification, OrganizationUnit, WorkflowInstance
from apps.core.services import _create_configured_task


@pytest.mark.django_db
@pytest.mark.parametrize(("registry", "segment"), [("external", "externes"), ("internal", "internes")])
@pytest.mark.parametrize("kind", ["validation", "signature"])
def test_task_notifications_link_to_the_correspondence(registry, segment, kind):
    creator = User.objects.create_user("notification-creator")
    actor = User.objects.create_user("notification-actor")
    unit = OrganizationUnit.objects.create(code="NOTIF", name="Notifications")
    item = Correspondence.objects.create(
        registry=registry, sender="Expéditeur", received_at="2026-09-05", subject="Notification",
        direction=unit, responsible_service=unit, created_by=creator,
    )
    workflow = WorkflowInstance.objects.create(correspondence=item, started_by=actor)
    step = {"key": "review", "kind": kind, "actor": "creator"}

    task = _create_configured_task(workflow, item, step, actor)
    _create_configured_task(workflow, item, step, actor)

    notification = Notification.objects.get(recipient=creator)
    assert notification.path == f"/courriers/{segment}/{item.id}"
    assert notification.data["correspondence_id"] == str(item.id)
    assert notification.data["task_id"] == str(task.id)
    assert notification.email_requested


@pytest.mark.django_db
def test_migration_repairs_existing_paths_without_changing_notification_state():
    recipient = User.objects.create_user("notification-migration")
    read_at = timezone.now()
    paths = [
        ("/courriers/externals/123", "/courriers/externes/123"),
        ("/courriers/internals/456/signature?source=email#document", "/courriers/internes/456/signature?source=email#document"),
        ("/courriers/externes/789", "/courriers/externes/789"),
        ("/activite?next=/courriers/externals/123", "/activite?next=/courriers/externals/123"),
    ]
    notifications = [Notification.objects.create(
        recipient=recipient, title="Notification existante", path=path, read_at=read_at,
        email_sent_at=read_at, data={"source": "workflow"},
    ) for path, _ in paths]
    migration = import_module("apps.core.migrations.0011_fix_notification_paths")

    for _ in range(2):
        migration.fix_notification_paths(apps, SimpleNamespace(connection=connection))

    for notification, (_, expected) in zip(notifications, paths):
        notification.refresh_from_db()
        assert notification.path == expected
        assert notification.read_at == read_at
        assert notification.email_sent_at == read_at
        assert notification.data == {"source": "workflow"}
