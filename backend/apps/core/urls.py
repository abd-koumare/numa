from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .runtime_views import field_choices, published_form, published_page

from .views import (
    AccessGroupViewSet,
    AccessRoleViewSet,
    AuditEventViewSet,
    BackupJobViewSet,
    ConfigurationDefinitionViewSet,
    CorrespondenceViewSet,
    DirectoryUserViewSet,
    GenericListItemViewSet,
    IdentityProviderConfigurationViewSet,
    ListInstanceViewSet,
    NotificationViewSet,
    OrganizationSettingsView,
    OrganizationUnitViewSet,
    SavedSearchViewSet,
    SystemSettingViewSet,
    TransferJobViewSet,
    WebhookEndpointViewSet,
    WorkflowTaskViewSet,
    activity,
    dashboard,
    global_search,
    health,
    initial_setup,
    me,
    numbering_preview,
    operational_status,
    public_config,
    UserPreferenceView,
)

router = DefaultRouter()
router.register("correspondences", CorrespondenceViewSet, basename="correspondence")
router.register("organization-units", OrganizationUnitViewSet, basename="organization-unit")
router.register("identity/users", DirectoryUserViewSet, basename="identity-user")
router.register("identity/groups", AccessGroupViewSet, basename="identity-group")
router.register("identity/roles", AccessRoleViewSet, basename="identity-role")
router.register("identity/providers", IdentityProviderConfigurationViewSet, basename="identity-provider")
router.register("configurations", ConfigurationDefinitionViewSet, basename="configuration")
router.register("tasks", WorkflowTaskViewSet, basename="workflow-task")
router.register("notifications", NotificationViewSet, basename="notification")
router.register("audit-events", AuditEventViewSet, basename="audit-event")
router.register("saved-searches", SavedSearchViewSet, basename="saved-search")
router.register("transfers", TransferJobViewSet, basename="transfer")
router.register("backups", BackupJobViewSet, basename="backup")
router.register("webhooks", WebhookEndpointViewSet, basename="webhook")
router.register("list-instances", ListInstanceViewSet, basename="list-instance")
router.register("list-items", GenericListItemViewSet, basename="list-item")
router.register("system-settings", SystemSettingViewSet, basename="system-setting")

urlpatterns = [
    path("runtime/pages/<slug:slug>/", published_page, name="published-page"),
    path("runtime/forms/<slug:slug>/", published_form, name="published-form"),
    path("runtime/choices/<slug:kind>/", field_choices, name="field-choices"),
    path("health/", health, name="health"),
    path("public-config/", public_config, name="public-config"),
    path("setup/", initial_setup, name="initial-setup"),
    path("me/", me, name="me"),
    path("me/preferences/", UserPreferenceView.as_view(), name="user-preferences"),
    path("numbering/preview/", numbering_preview, name="numbering-preview"),
    path("organization-settings/", OrganizationSettingsView.as_view(), name="organization-settings"),
    path("search/", global_search, name="global-search"),
    path("dashboard/", dashboard, name="dashboard"),
    path("activity/", activity, name="activity"),
    path("operations/status/", operational_status, name="operational-status"),
    path("", include(router.urls)),
]
