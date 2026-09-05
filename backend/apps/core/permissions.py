from rest_framework.permissions import BasePermission, SAFE_METHODS

from .capabilities import Capability, has_capability
from .models import Correspondence
from .services import has_correspondence_capability


class HasViewCapability(BasePermission):
    """Uses a view's action_capabilities/method_capabilities declaration."""

    def has_permission(self, request, view):
        action = getattr(view, "action", None)
        capability = getattr(view, "action_capabilities", {}).get(action)
        if capability is None:
            capability = getattr(view, "method_capabilities", {}).get(request.method)
        return capability is None or has_capability(request.user, capability)


class CorrespondencePermission(BasePermission):
    action_capabilities = {
        "list": Capability.CORRESPONDENCE_READ,
        "retrieve": Capability.CORRESPONDENCE_READ,
        "create": Capability.CORRESPONDENCE_CREATE,
        "partial_update": Capability.CORRESPONDENCE_UPDATE,
        "create_document": Capability.DOCUMENT_UPLOAD,
        "download_document": Capability.DOCUMENT_DOWNLOAD,
        "submit": Capability.CORRESPONDENCE_SUBMIT,
        "validate": Capability.CORRESPONDENCE_VALIDATE,
        "reject": Capability.CORRESPONDENCE_REJECT,
        "cancel": Capability.CORRESPONDENCE_CANCEL,
        "reopen": Capability.CORRESPONDENCE_REOPEN,
        "archive": Capability.CORRESPONDENCE_ARCHIVE,
        "sign": Capability.CORRESPONDENCE_SIGN,
        "signature_access": Capability.CORRESPONDENCE_READ,
        "access_grants": Capability.CORRESPONDENCE_MANAGE_ACL,
        "replace_access_grants": Capability.CORRESPONDENCE_MANAGE_ACL,
    }

    def has_permission(self, request, view):
        capability = self.action_capabilities.get(getattr(view, "action", None))
        if capability is None:
            capability = Capability.CORRESPONDENCE_READ if request.method in SAFE_METHODS else Capability.CORRESPONDENCE_UPDATE
        return has_capability(request.user, capability)

    def has_object_permission(self, request, view, obj):
        if not isinstance(obj, Correspondence):
            return False
        capability = self.action_capabilities.get(getattr(view, "action", None))
        if capability is None:
            capability = Capability.CORRESPONDENCE_READ if request.method in SAFE_METHODS else Capability.CORRESPONDENCE_UPDATE
        return has_correspondence_capability(request.user, obj, capability)
