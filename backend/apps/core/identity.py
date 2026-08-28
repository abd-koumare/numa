from __future__ import annotations

import xml.etree.ElementTree as ET
from urllib.parse import urljoin, urlparse

import requests
from django.conf import settings


class IdentityProviderError(RuntimeError):
    pass


SECRET_FIELDS = {"client_secret", "bind_credential", "private_key"}


def public_identity_config(config: dict) -> dict:
    safe = {}
    for key, value in (config or {}).items():
        if key in SECRET_FIELDS:
            safe[f"has_{key}"] = bool(value)
        else:
            safe[key] = value
    return safe


def validate_identity_config(provider: str, config: dict) -> dict:
    if not isinstance(config, dict):
        raise IdentityProviderError("La configuration doit être un objet JSON.")
    normalized = {str(key): value for key, value in config.items()}
    required = {
        "oidc": ("issuer_url", "client_id"),
        "saml": ("metadata_url",),
        "ldap": ("connection_url", "bind_dn", "bind_credential", "users_dn"),
        "active_directory": ("connection_url", "bind_dn", "bind_credential", "users_dn"),
    }.get(provider)
    if required is None:
        raise IdentityProviderError("Type de fournisseur d’identité inconnu.")
    missing = [key for key in required if not str(normalized.get(key, "")).strip()]
    if missing:
        raise IdentityProviderError(f"Champs obligatoires manquants : {', '.join(missing)}.")
    if provider in {"oidc", "saml"}:
        key = "issuer_url" if provider == "oidc" else "metadata_url"
        if urlparse(str(normalized[key])).scheme not in {"http", "https"}:
            raise IdentityProviderError(f"{key} doit être une URL HTTP(S).")
    if provider in {"ldap", "active_directory"} and urlparse(str(normalized["connection_url"])).scheme not in {"ldap", "ldaps"}:
        raise IdentityProviderError("connection_url doit commencer par ldap:// ou ldaps://.")
    normalized.setdefault("verify_tls", True)
    return normalized


def _request(method: str, url: str, **kwargs):
    try:
        response = requests.request(method, url, timeout=settings.IDENTITY_PROVIDER_TIMEOUT_SECONDS, **kwargs)
        response.raise_for_status()
        return response
    except requests.RequestException as exc:
        detail = ""
        if getattr(exc, "response", None) is not None:
            detail = f" ({exc.response.status_code}: {exc.response.text[:300]})"
        raise IdentityProviderError(f"Connexion au fournisseur impossible{detail}.") from exc


def discover_oidc(config: dict) -> dict:
    issuer = str(config["issuer_url"]).rstrip("/")
    response = _request("GET", f"{issuer}/.well-known/openid-configuration", verify=bool(config.get("verify_tls", True)))
    try:
        discovery = response.json()
    except ValueError as exc:
        raise IdentityProviderError("Le document de découverte OIDC n’est pas un JSON valide.") from exc
    if str(discovery.get("issuer", "")).rstrip("/") != issuer:
        raise IdentityProviderError("L’issuer retourné ne correspond pas à l’URL configurée.")
    for key in ("authorization_endpoint", "token_endpoint", "jwks_uri"):
        if not discovery.get(key):
            raise IdentityProviderError(f"Le document OIDC ne contient pas {key}.")
    return discovery


def load_saml_metadata(config: dict) -> ET.Element:
    response = _request("GET", str(config["metadata_url"]), verify=bool(config.get("verify_tls", True)))
    try:
        root = ET.fromstring(response.content)
    except ET.ParseError as exc:
        raise IdentityProviderError("Les métadonnées SAML ne sont pas un document XML valide.") from exc
    if not root.tag.endswith(("EntityDescriptor", "EntitiesDescriptor")):
        raise IdentityProviderError("Les métadonnées SAML ne contiennent aucun EntityDescriptor.")
    return root


def _test_ldap(config: dict) -> dict:
    try:
        import ssl
        from ldap3 import BASE, Connection, Server, Tls
    except ImportError as exc:
        raise IdentityProviderError("Le support LDAP n’est pas installé sur ce serveur NUMA.") from exc
    tls = Tls(validate=ssl.CERT_REQUIRED if config.get("verify_tls", True) else ssl.CERT_NONE)
    server = Server(config["connection_url"], connect_timeout=settings.IDENTITY_PROVIDER_TIMEOUT_SECONDS, tls=tls)
    try:
        connection = Connection(server, user=config["bind_dn"], password=config["bind_credential"], auto_bind=True, receive_timeout=settings.IDENTITY_PROVIDER_TIMEOUT_SECONDS)
        connection.search(config["users_dn"], config.get("user_filter") or "(objectClass=*)", search_scope=BASE, size_limit=1)
        if connection.result.get("result") not in {0, 4, 32}:
            raise IdentityProviderError(f"La recherche LDAP a échoué : {connection.result.get('message', 'erreur inconnue')}.")
        return {"server": str(server.host), "directory_reachable": True}
    except IdentityProviderError:
        raise
    except Exception as exc:
        raise IdentityProviderError(f"La connexion LDAP a échoué : {exc}.") from exc
    finally:
        if "connection" in locals():
            connection.unbind()


def test_identity_provider(provider: str, config: dict) -> dict:
    config = validate_identity_config(provider, config)
    if provider == "oidc":
        discovery = discover_oidc(config)
        return {"issuer": discovery["issuer"], "authorization_endpoint": discovery["authorization_endpoint"]}
    if provider == "saml":
        root = load_saml_metadata(config)
        return {"entity_id": root.attrib.get("entityID", ""), "metadata_valid": True}
    return _test_ldap(config)


class KeycloakAdmin:
    def __init__(self):
        self.base_url = settings.KEYCLOAK_ADMIN_URL.rstrip("/") + "/"
        self.realm = settings.KEYCLOAK_REALM

    def _token(self) -> str:
        if not settings.KEYCLOAK_ADMIN_USERNAME or not settings.KEYCLOAK_ADMIN_PASSWORD:
            raise IdentityProviderError("Les identifiants d’administration Keycloak ne sont pas configurés.")
        response = _request(
            "POST",
            urljoin(self.base_url, "realms/master/protocol/openid-connect/token"),
            data={"grant_type": "password", "client_id": "admin-cli", "username": settings.KEYCLOAK_ADMIN_USERNAME, "password": settings.KEYCLOAK_ADMIN_PASSWORD},
            verify=settings.KEYCLOAK_ADMIN_VERIFY_TLS,
        )
        try:
            return response.json()["access_token"]
        except (KeyError, ValueError) as exc:
            raise IdentityProviderError("Keycloak n’a pas retourné de jeton d’administration.") from exc

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self._token()}", "Content-Type": "application/json"}

    def _url(self, path: str) -> str:
        return urljoin(self.base_url, f"admin/realms/{self.realm}/{path.lstrip('/')}")

    def _realm_id(self, headers: dict) -> str:
        response = _request("GET", urljoin(self.base_url, f"admin/realms/{self.realm}"), headers=headers, verify=settings.KEYCLOAK_ADMIN_VERIFY_TLS)
        return response.json()["id"]

    def _upsert_broker(self, alias: str, payload: dict, headers: dict):
        instance_url = self._url(f"identity-provider/instances/{alias}")
        existing = requests.get(instance_url, headers=headers, timeout=settings.IDENTITY_PROVIDER_TIMEOUT_SECONDS, verify=settings.KEYCLOAK_ADMIN_VERIFY_TLS)
        if existing.status_code == 200:
            _request("PUT", instance_url, headers=headers, json=payload, verify=settings.KEYCLOAK_ADMIN_VERIFY_TLS)
        elif existing.status_code == 404:
            _request("POST", self._url("identity-provider/instances"), headers=headers, json=payload, verify=settings.KEYCLOAK_ADMIN_VERIFY_TLS)
        else:
            raise IdentityProviderError(f"Impossible de consulter les fournisseurs Keycloak ({existing.status_code}).")

    def upsert(self, *, alias: str, display_name: str, provider: str, enabled: bool, config: dict, resource_id: str = "") -> str:
        config = validate_identity_config(provider, config)
        headers = self._headers()
        if provider == "oidc":
            discovery = discover_oidc(config)
            payload = {
                "alias": alias, "displayName": display_name, "providerId": "oidc", "enabled": enabled,
                "trustEmail": bool(config.get("trust_email", False)),
                "config": {
                    "issuer": discovery["issuer"], "authorizationUrl": discovery["authorization_endpoint"],
                    "tokenUrl": discovery["token_endpoint"], "jwksUrl": discovery["jwks_uri"],
                    "clientId": str(config["client_id"]), "clientSecret": str(config.get("client_secret", "")),
                    "defaultScope": str(config.get("scopes", "openid profile email")),
                    "syncMode": str(config.get("sync_mode", "IMPORT")), "validateSignature": "true", "useJwksUrl": "true",
                },
            }
            self._upsert_broker(alias, payload, headers)
            return alias
        if provider == "saml":
            root = load_saml_metadata(config)
            ns = {"md": "urn:oasis:names:tc:SAML:2.0:metadata", "ds": "http://www.w3.org/2000/09/xmldsig#"}
            sso = root.find(".//md:IDPSSODescriptor/md:SingleSignOnService", ns)
            certificate = root.find(".//md:IDPSSODescriptor/md:KeyDescriptor/ds:KeyInfo/ds:X509Data/ds:X509Certificate", ns)
            if sso is None or not sso.attrib.get("Location"):
                raise IdentityProviderError("Les métadonnées SAML ne contiennent pas de service SSO.")
            payload = {
                "alias": alias, "displayName": display_name, "providerId": "saml", "enabled": enabled,
                "trustEmail": bool(config.get("trust_email", False)),
                "config": {
                    "entityId": str(config.get("service_provider_entity_id") or settings.NUMA_PUBLIC_URL),
                    "singleSignOnServiceUrl": sso.attrib["Location"],
                    "signingCertificate": "".join((certificate.text or "").split()) if certificate is not None else "",
                    "nameIDPolicyFormat": str(config.get("name_id_policy", "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress")),
                    "syncMode": str(config.get("sync_mode", "IMPORT")), "validateSignature": "true",
                },
            }
            self._upsert_broker(alias, payload, headers)
            return alias

        payload = {
            "name": display_name, "providerId": "ldap", "providerType": "org.keycloak.storage.UserStorageProvider",
            "parentId": self._realm_id(headers),
            "config": {
                "enabled": ["true" if enabled else "false"], "priority": [str(config.get("priority", 0))],
                "connectionUrl": [str(config["connection_url"])], "bindDn": [str(config["bind_dn"])],
                "bindCredential": [str(config["bind_credential"])], "usersDn": [str(config["users_dn"])],
                "vendor": ["ad" if provider == "active_directory" else str(config.get("vendor", "other"))],
                "usernameLDAPAttribute": [str(config.get("username_attribute", "sAMAccountName" if provider == "active_directory" else "uid"))],
                "rdnLDAPAttribute": [str(config.get("rdn_attribute", "cn"))],
                "uuidLDAPAttribute": [str(config.get("uuid_attribute", "objectGUID" if provider == "active_directory" else "entryUUID"))],
                "userObjectClasses": [str(config.get("user_object_classes", "person, organizationalPerson, user" if provider == "active_directory" else "inetOrgPerson, organizationalPerson"))],
                "searchScope": [str(config.get("search_scope", "1"))], "editMode": ["READ_ONLY"],
                "importEnabled": ["true"], "syncRegistrations": ["false"],
                "trustEmail": ["true" if config.get("trust_email", False) else "false"],
                "useTruststoreSpi": ["ldapsOnly" if config.get("verify_tls", True) else "never"],
            },
        }
        if config.get("user_filter"):
            payload["config"]["customUserSearchFilter"] = [str(config["user_filter"])]
        if resource_id:
            _request("PUT", self._url(f"components/{resource_id}"), headers=headers, json={**payload, "id": resource_id}, verify=settings.KEYCLOAK_ADMIN_VERIFY_TLS)
            return resource_id
        response = _request("POST", self._url("components"), headers=headers, json=payload, verify=settings.KEYCLOAK_ADMIN_VERIFY_TLS)
        return response.headers.get("Location", "").rstrip("/").rsplit("/", 1)[-1]

    def delete(self, *, provider: str, alias: str, resource_id: str):
        if provider in {"oidc", "saml"}:
            path = f"identity-provider/instances/{alias}"
        elif resource_id:
            path = f"components/{resource_id}"
        else:
            return
        response = requests.delete(self._url(path), headers=self._headers(), timeout=settings.IDENTITY_PROVIDER_TIMEOUT_SECONDS, verify=settings.KEYCLOAK_ADMIN_VERIFY_TLS)
        if response.status_code not in {204, 404}:
            raise IdentityProviderError(f"Keycloak a refusé la suppression ({response.status_code}).")

    def users(self, search: str = "") -> list[dict]:
        response = _request(
            "GET",
            self._url("users"),
            headers=self._headers(),
            params={"search": search, "max": 50, "briefRepresentation": "true"},
            verify=settings.KEYCLOAK_ADMIN_VERIFY_TLS,
        )
        return [{
            "subject": item.get("id", ""),
            "username": item.get("username", ""),
            "name": " ".join(value for value in [item.get("firstName", ""), item.get("lastName", "")] if value).strip() or item.get("username", ""),
            "email": item.get("email", ""),
            "active": bool(item.get("enabled", False)),
        } for item in response.json()]
