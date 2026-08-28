from cryptography.fernet import Fernet
from django.conf import settings
from django.core.checks import Error, Warning, register


@register(deploy=True)
def numa_deployment_checks(app_configs, **kwargs):
    messages = []
    if settings.DEBUG:
        messages.append(Error("DJANGO_DEBUG doit être désactivé en production.", id="numa.E001"))
    if settings.SECRET_KEY == "unsafe-development-key-change-me" or len(settings.SECRET_KEY) < 40:
        messages.append(Error("DJANGO_SECRET_KEY doit être un secret aléatoire d’au moins 40 caractères.", id="numa.E002"))
    if not settings.NUMA_ENCRYPTION_KEY:
        messages.append(Error("NUMA_ENCRYPTION_KEY est obligatoire pour chiffrer les secrets.", id="numa.E003"))
    else:
        try:
            Fernet(settings.NUMA_ENCRYPTION_KEY.encode("ascii"))
        except (ValueError, TypeError):
            messages.append(Error("NUMA_ENCRYPTION_KEY doit être une clé Fernet valide.", id="numa.E004"))
    if not settings.NUMA_BACKUP_ENCRYPTION_KEY:
        messages.append(Error("NUMA_BACKUP_ENCRYPTION_KEY est obligatoire pour les sauvegardes.", id="numa.E007"))
    if not settings.NUMA_SETUP_TOKEN or settings.NUMA_SETUP_TOKEN == "numa-local-setup":
        messages.append(Error("NUMA_SETUP_TOKEN doit être remplacé avant le déploiement.", id="numa.E005"))
    if settings.OIDC_ALLOW_DEV_AUTH:
        messages.append(Error("OIDC_ALLOW_DEV_AUTH doit être désactivé en production.", id="numa.E006"))
    if not settings.KEYCLOAK_ADMIN_PASSWORD:
        messages.append(Warning("L’assistant d’identité sera indisponible sans KEYCLOAK_ADMIN_PASSWORD.", id="numa.W001"))
    return messages
