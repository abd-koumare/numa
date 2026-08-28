from dataclasses import dataclass

from django.conf import settings

from .exceptions import StateConflict
from .models import ConfigurationVersion, SignatureProof
from .runtime import configuration_data


@dataclass(frozen=True)
class SignatureCapabilities:
    internal: bool
    graphic: bool
    digital: bool
    digital_provider: str
    digital_provider_available: bool

    def as_dict(self) -> dict:
        return {
            "internal": self.internal,
            "graphic": self.graphic,
            "digital": self.digital,
            "digital_provider": self.digital_provider,
            "digital_provider_available": self.digital_provider_available,
        }


class DisabledDigitalSignatureProvider:
    def __init__(self, slug="disabled"):
        self.slug = slug

    @property
    def available(self) -> bool:
        return False

    def request_signature(self, **kwargs):
        raise StateConflict("La signature numérique qualifiée n’est pas configurée.")


def digital_signature_provider():
    provider_name = getattr(settings, "NUMA_DIGITAL_SIGNATURE_PROVIDER", "disabled")
    return DisabledDigitalSignatureProvider(provider_name)


def signature_capabilities(policy_version: ConfigurationVersion | None) -> SignatureCapabilities:
    policy = configuration_data(policy_version)
    provider = digital_signature_provider()
    digital_enabled = bool(policy.get("digitalSignatureEnabled", False))
    return SignatureCapabilities(
        internal=bool(policy.get("internalValidationEnabled", True)),
        graphic=bool(policy.get("graphicSignatureEnabled", True)),
        digital=digital_enabled and provider.available,
        digital_provider=provider.slug,
        digital_provider_available=provider.available,
    )


def assert_signature_level_available(level: str, policy_version: ConfigurationVersion | None) -> str:
    capabilities = signature_capabilities(policy_version)
    if level == SignatureProof.Level.INTERNAL and not capabilities.internal:
        raise StateConflict("La validation électronique interne est désactivée par la politique épinglée.")
    if level == SignatureProof.Level.GRAPHIC and not capabilities.graphic:
        raise StateConflict("La signature graphique est désactivée par la politique épinglée.")
    if level == SignatureProof.Level.DIGITAL:
        if not configuration_data(policy_version).get("digitalSignatureEnabled", False):
            raise StateConflict("La signature numérique qualifiée est désactivée par la politique épinglée.")
        provider = digital_signature_provider()
        if not provider.available:
            raise StateConflict("La signature numérique qualifiée sera disponible après configuration d’un prestataire.")
        return provider.slug
    return "numa-internal" if level == SignatureProof.Level.INTERNAL else "numa-graphic"
