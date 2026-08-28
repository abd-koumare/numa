from datetime import datetime, timezone

import jwt
from django.conf import settings
from django.contrib.auth.models import User
from django.db import transaction
from rest_framework import authentication, exceptions

from .capabilities import DEFAULT_ROLES
from .models import AccessRole, UserProfile
from .services import sync_directory_memberships, sync_role_assignments, sync_service_membership


NUMA_ROLES = set(DEFAULT_ROLES)


class KeycloakJWTAuthentication(authentication.BaseAuthentication):
    _jwk_client = None

    def authenticate(self, request):
        header = authentication.get_authorization_header(request).decode("utf-8")
        if settings.OIDC_ALLOW_DEV_AUTH and not header and request.headers.get("X-Dev-User"):
            return self._development_user(request.headers["X-Dev-User"]), None
        if not header:
            return None
        parts = header.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            raise exceptions.AuthenticationFailed("En-tête Authorization invalide.", code="invalid_authorization_header")
        try:
            if self.__class__._jwk_client is None:
                self.__class__._jwk_client = jwt.PyJWKClient(settings.OIDC_JWKS_URL, cache_keys=True)
            signing_key = self.__class__._jwk_client.get_signing_key_from_jwt(parts[1])
            claims = jwt.decode(
                parts[1],
                signing_key.key,
                algorithms=["RS256"],
                audience=settings.OIDC_AUDIENCE,
                issuer=settings.OIDC_ISSUER,
                options={"require": ["exp", "iat", "sub", "iss"]},
                leeway=settings.OIDC_CLOCK_SKEW_SECONDS,
            )
        except jwt.PyJWTError as exc:
            raise exceptions.AuthenticationFailed("Jeton OIDC invalide ou expiré.", code="invalid_token") from exc
        return self._sync_user(claims), claims

    def authenticate_header(self, request):
        return 'Bearer realm="numa"'

    @transaction.atomic
    def _sync_user(self, claims):
        subject = claims["sub"]
        realm_roles = claims.get("realm_access", {}).get("roles", [])
        client_roles = claims.get("resource_access", {}).get(settings.OIDC_AUDIENCE, {}).get("roles", [])
        roles = sorted(NUMA_ROLES.intersection([*realm_roles, *client_roles]))
        # organization_unit is nullable, so joining it here would make a plain
        # PostgreSQL FOR UPDATE try to lock the nullable side of an outer join.
        locked_profiles = UserProfile.objects.select_for_update().select_related("user")
        profile = locked_profiles.filter(keycloak_subject=subject).first()
        if profile is None:
            preferred = claims.get("preferred_username") or ""
            profile = locked_profiles.filter(keycloak_subject=f"bootstrap:{preferred}").first()
            if profile:
                profile.keycloak_subject = subject
        if profile and (not profile.active or not profile.user.is_active):
            raise exceptions.AuthenticationFailed("Votre accès NUMA est suspendu.", code="account_disabled")
        if profile:
            user = profile.user
        else:
            preferred = claims.get("preferred_username") or f"oidc_{subject}"
            username = preferred[:150]
            if User.objects.filter(username=username).exists():
                username = f"oidc_{subject}"[:150]
            user = User(username=username, is_active=True)
        user.email = claims.get("email", "")[:254]
        user.first_name = claims.get("given_name", "")[:150]
        user.last_name = claims.get("family_name", "")[:150]
        user.save()
        if profile is None:
            profile = UserProfile(
                user=user,
                keycloak_subject=subject,
                active=True,
                access_requested_at=None if roles else datetime.now(timezone.utc),
            )
        profile.roles = roles
        external_groups = claims.get("groups", [])
        profile.external_groups = external_groups
        profile.last_seen_at = datetime.now(timezone.utc)
        profile.save()
        sync_role_assignments(profile, roles)
        sync_directory_memberships(profile, external_groups)
        sync_service_membership(profile)
        return user

    @transaction.atomic
    def _development_user(self, username):
        user, _ = User.objects.get_or_create(
            username=username,
            defaults={"email": f"{username}@localhost", "is_active": True},
        )
        profile, _ = UserProfile.objects.get_or_create(
            user=user,
            defaults={"keycloak_subject": f"dev:{username}", "roles": ["super-admin"]},
        )
        if not profile.active or not user.is_active:
            raise exceptions.AuthenticationFailed("Votre accès NUMA est suspendu.", code="account_disabled")
        role_definition = DEFAULT_ROLES["super-admin"]
        role, _ = AccessRole.objects.get_or_create(
            slug="super-admin",
            defaults={
                "label": role_definition["label"],
                "description": role_definition["description"],
                "capabilities": role_definition["capabilities"],
                "protected": True,
            },
        )
        profile.roles = ["super-admin"]
        profile.last_seen_at = datetime.now(timezone.utc)
        profile.save(update_fields=["roles", "last_seen_at"])
        sync_role_assignments(profile, [role.slug])
        sync_service_membership(profile)
        return user
