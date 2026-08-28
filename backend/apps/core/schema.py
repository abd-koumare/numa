from drf_spectacular.extensions import OpenApiAuthenticationExtension


class KeycloakJWTAuthenticationScheme(OpenApiAuthenticationExtension):
    target_class = "apps.core.authentication.KeycloakJWTAuthentication"
    name = "bearerAuth"

    def get_security_definition(self, auto_schema):
        return {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "Jeton d’accès OpenID Connect émis par Keycloak.",
        }
