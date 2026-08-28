from django.contrib import admin

from .models import AuditEvent, Correspondence, DocumentVersion, OrganizationUnit, UserProfile, WorkflowEvent

admin.site.register([OrganizationUnit, UserProfile, Correspondence, DocumentVersion, WorkflowEvent, AuditEvent])
