from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError


class PreconditionRequired(APIException):
    status_code = 428
    default_detail = "La version de la ressource doit être fournie avec l’en-tête If-Match."
    default_code = "if_match_required"


class StaleVersion(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "La ressource a été modifiée par un autre utilisateur. Rechargez-la avant de continuer."
    default_code = "stale_version"


class StateConflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "Cette opération n’est pas autorisée dans l’état actuel."
    default_code = "state_conflict"


def problem_exception_handler(exc, context):
    # Imported lazily because DRF loads authentication classes while
    # rest_framework.views itself is still being initialized.
    from rest_framework.views import exception_handler

    response = exception_handler(exc, context)
    if response is None:
        return None
    errors = response.data if isinstance(response.data, dict) else None
    detail = response.data.get("detail") if errors else None
    code = "validation_error" if isinstance(exc, ValidationError) else getattr(exc, "default_code", None)
    if detail is not None:
        code = getattr(detail, "code", None) or code
    response.data = {
        "code": code or ("request_error" if detail else "validation_error"),
        "detail": str(detail) if detail else "La requête contient des données invalides.",
        "errors": errors if not detail else None,
    }
    return response
