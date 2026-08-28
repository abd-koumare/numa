from collections.abc import Iterable

from django.contrib.auth.models import AnonymousUser, User

from .models import AccessRole, UserProfile


class Capability:
    CORRESPONDENCE_READ = "correspondence.read"
    CORRESPONDENCE_READ_ALL = "correspondence.read_all"
    CORRESPONDENCE_CREATE = "correspondence.create"
    CORRESPONDENCE_UPDATE = "correspondence.update"
    CORRESPONDENCE_SUBMIT = "correspondence.submit"
    CORRESPONDENCE_VALIDATE = "correspondence.validate"
    CORRESPONDENCE_REJECT = "correspondence.reject"
    CORRESPONDENCE_CANCEL = "correspondence.cancel"
    CORRESPONDENCE_REOPEN = "correspondence.reopen"
    CORRESPONDENCE_ARCHIVE = "correspondence.archive"
    CORRESPONDENCE_SIGN = "correspondence.sign"
    CORRESPONDENCE_MANAGE_ACL = "correspondence.manage_acl"
    DOCUMENT_UPLOAD = "document.upload"
    DOCUMENT_DOWNLOAD = "document.download"
    TASK_READ = "task.read"
    TASK_ACT = "task.act"
    TASK_ASSIGN = "task.assign"
    SEARCH_USE = "search.use"
    CONFIGURATION_READ = "configuration.read"
    CONFIGURATION_MANAGE = "configuration.manage"
    CONFIGURATION_PUBLISH = "configuration.publish"
    IDENTITY_READ = "identity.read"
    IDENTITY_MANAGE = "identity.manage"
    AUDIT_READ = "audit.read"
    AUDIT_EXPORT = "audit.export"
    NOTIFICATION_READ = "notification.read"
    TRANSFER_IMPORT = "transfer.import"
    TRANSFER_EXPORT = "transfer.export"
    BACKUP_MANAGE = "backup.manage"
    INTEGRATION_MANAGE = "integration.manage"
    SYSTEM_MANAGE = "system.manage"


ALL_CAPABILITIES = {
    value
    for name, value in vars(Capability).items()
    if name.isupper() and isinstance(value, str)
}


DEFAULT_ROLES = {
    "super-admin": {
        "label": "Super administrateur",
        "description": "Administration technique, restauration et sécurité.",
        "capabilities": sorted(ALL_CAPABILITIES),
        "protected": True,
    },
    "admin": {
        "label": "Administrateur",
        "description": "Administration fonctionnelle, identités, contenus et intégrations.",
        "capabilities": sorted(ALL_CAPABILITIES - {Capability.BACKUP_MANAGE}),
        "protected": True,
    },
    "configurateur": {
        "label": "Configurateur",
        "description": "Formulaires, vues, règles, workflows et navigation.",
        "capabilities": [
            Capability.CONFIGURATION_READ,
            Capability.CONFIGURATION_MANAGE,
            Capability.CONFIGURATION_PUBLISH,
            Capability.CORRESPONDENCE_READ,
            Capability.DOCUMENT_DOWNLOAD,
            Capability.SEARCH_USE,
            Capability.NOTIFICATION_READ,
        ],
    },
    "gestionnaire": {
        "label": "Gestionnaire",
        "description": "Création, enregistrement et suivi des éléments métier.",
        "capabilities": [
            Capability.CORRESPONDENCE_READ,
            Capability.CORRESPONDENCE_CREATE,
            Capability.CORRESPONDENCE_UPDATE,
            Capability.CORRESPONDENCE_SUBMIT,
            Capability.CORRESPONDENCE_CANCEL,
            Capability.CORRESPONDENCE_REOPEN,
            Capability.CORRESPONDENCE_ARCHIVE,
            Capability.CORRESPONDENCE_MANAGE_ACL,
            Capability.DOCUMENT_UPLOAD,
            Capability.DOCUMENT_DOWNLOAD,
            Capability.TASK_READ,
            Capability.TASK_ACT,
            Capability.TASK_ASSIGN,
            Capability.SEARCH_USE,
            Capability.NOTIFICATION_READ,
            Capability.TRANSFER_IMPORT,
            Capability.TRANSFER_EXPORT,
        ],
    },
    "validateur": {
        "label": "Validateur",
        "description": "Approbation, rejet et signature selon habilitation.",
        "capabilities": [
            Capability.CORRESPONDENCE_READ,
            Capability.CORRESPONDENCE_VALIDATE,
            Capability.CORRESPONDENCE_REJECT,
            Capability.CORRESPONDENCE_SIGN,
            Capability.DOCUMENT_DOWNLOAD,
            Capability.TASK_READ,
            Capability.TASK_ACT,
            Capability.SEARCH_USE,
            Capability.NOTIFICATION_READ,
        ],
    },
    "utilisateur": {
        "label": "Utilisateur",
        "description": "Création et consultation dans son périmètre.",
        "capabilities": [
            Capability.CORRESPONDENCE_READ,
            Capability.CORRESPONDENCE_CREATE,
            Capability.CORRESPONDENCE_UPDATE,
            Capability.CORRESPONDENCE_SUBMIT,
            Capability.DOCUMENT_UPLOAD,
            Capability.DOCUMENT_DOWNLOAD,
            Capability.TASK_READ,
            Capability.SEARCH_USE,
            Capability.NOTIFICATION_READ,
        ],
    },
    "lecteur": {
        "label": "Lecteur",
        "description": "Consultation uniquement dans son périmètre.",
        "capabilities": [
            Capability.CORRESPONDENCE_READ,
            Capability.DOCUMENT_DOWNLOAD,
            Capability.SEARCH_USE,
            Capability.NOTIFICATION_READ,
        ],
    },
    "auditeur": {
        "label": "Auditeur",
        "description": "Consultation globale et journal d’audit sans mutation métier.",
        "capabilities": [
            Capability.CORRESPONDENCE_READ,
            Capability.CORRESPONDENCE_READ_ALL,
            Capability.DOCUMENT_DOWNLOAD,
            Capability.SEARCH_USE,
            Capability.AUDIT_READ,
            Capability.AUDIT_EXPORT,
            Capability.NOTIFICATION_READ,
            Capability.TRANSFER_EXPORT,
        ],
    },
}


def get_profile(user: User | AnonymousUser) -> UserProfile | None:
    if not getattr(user, "is_authenticated", False) or not getattr(user, "is_active", False):
        return None
    try:
        profile = user.numa_profile
    except (AttributeError, UserProfile.DoesNotExist):
        return None
    return profile if profile.active else None


def effective_role_slugs(user: User | AnonymousUser) -> set[str]:
    profile = get_profile(user)
    if profile is None:
        return set()
    direct = set(profile.role_assignments.filter(role__active=True).values_list("role_id", flat=True))
    inherited = set(
        AccessRole.objects.filter(active=True, groups__memberships__profile=profile).values_list("slug", flat=True)
    )
    # Legacy roles remain a safe fallback while pre-V1 identities are being synchronized.
    return direct | inherited | set(profile.roles or [])


def effective_capabilities(user: User | AnonymousUser) -> set[str]:
    profile = get_profile(user)
    if profile is None:
        return set()
    roles = effective_role_slugs(user)
    capabilities: set[str] = set()
    for values in AccessRole.objects.filter(slug__in=roles, active=True).values_list("capabilities", flat=True):
        capabilities.update(values or [])
    # Allows the very first authenticated administrator to recover if role seeding was interrupted.
    for slug in roles:
        capabilities.update(DEFAULT_ROLES.get(slug, {}).get("capabilities", []))
    return capabilities


def has_capability(user: User | AnonymousUser, capability: str) -> bool:
    return capability in effective_capabilities(user)


def has_any_capability(user: User | AnonymousUser, capabilities: Iterable[str]) -> bool:
    return bool(effective_capabilities(user).intersection(capabilities))
