import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor


@pytest.mark.django_db(transaction=True)
def test_runtime_migration_backfills_versions_bundles_and_normalizes_open_instances():
    executor = MigrationExecutor(connection)
    migrate_from = [("core", "0009_listinstance_reopened")]
    migrate_to = [("core", "0010_runtime_configuration")]

    executor.migrate(migrate_from)
    old_apps = executor.loader.project_state(migrate_from).apps
    User = old_apps.get_model("auth", "User")
    Correspondence = old_apps.get_model("core", "Correspondence")
    Definition = old_apps.get_model("core", "ConfigurationDefinition")
    ListInstance = old_apps.get_model("core", "ListInstance")
    OrganizationUnit = old_apps.get_model("core", "OrganizationUnit")

    definition = Definition.objects.get(kind="list", slug="courriers-externes")
    active = ListInstance.objects.filter(definition_id=definition.pk, status="active").first()
    assert active is not None
    user = User.objects.create(username="runtime-migration")
    unit = OrganizationUnit.objects.create(code="MIG", name="Migration")
    correspondence = Correspondence.objects.create(
        registry="external",
        sender="Expéditeur migration",
        received_at="2026-08-28",
        subject="Vérification de la migration runtime",
        direction_id=unit.pk,
        responsible_service_id=unit.pk,
        created_by_id=user.pk,
        list_instance_id=active.pk,
        configuration_version_id=definition.current_version_id,
    )
    reopened = ListInstance.objects.create(
        definition_id=definition.pk,
        period_key="migration-reopened",
        label="Instance rouverte pour migration",
        status="reopened",
        active=True,
        configuration_version_id=definition.current_version_id,
    )

    try:
        executor = MigrationExecutor(connection)
        executor.migrate(migrate_to)
        new_apps = executor.loader.project_state(migrate_to).apps
        Version = new_apps.get_model("core", "ConfigurationVersion")
        Bundle = new_apps.get_model("core", "RuntimeConfigurationBundle")
        MigratedCorrespondence = new_apps.get_model("core", "Correspondence")
        MigratedListInstance = new_apps.get_model("core", "ListInstance")

        migrated_version = Version.objects.get(pk=definition.current_version_id)
        assert migrated_version.compiled_data == migrated_version.data
        assert len(migrated_version.content_hash) == 64
        migrated_correspondence = MigratedCorrespondence.objects.get(pk=correspondence.pk)
        assert migrated_correspondence.configuration_bundle_id is not None
        assert Bundle.objects.filter(pk=migrated_correspondence.configuration_bundle_id).exists()
        assert MigratedListInstance.objects.filter(
            definition_id=definition.pk,
            status__in=["active", "reopened"],
        ).count() == 1
        assert MigratedListInstance.objects.get(pk=reopened.pk).status == "reopened"
        assert MigratedListInstance.objects.get(pk=active.pk).status == "closed"
    finally:
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())
