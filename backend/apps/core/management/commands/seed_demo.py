from datetime import date

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from apps.core.models import Correspondence, OrganizationSettings, OrganizationUnit, UserProfile, WorkflowInstance
from apps.core.services import grant_default_correspondence_access, sync_role_assignments, sync_service_membership


class Command(BaseCommand):
    help = "Crée les unités et les principaux courriers de démonstration de manière idempotente."

    def handle(self, *args, **options):
        units = {
            code: OrganizationUnit.objects.update_or_create(code=code, defaults={"name": name})[0]
            for code, name in [
                ("DSI", "Direction des systèmes d’information"),
                ("DT", "Direction technique"),
                ("RH", "Ressources humaines"),
                ("FIN", "Direction financière"),
                ("SG", "Secrétariat général"),
                ("DIP", "Direction des infrastructures et du patrimoine"),
            ]
        }
        user, _ = User.objects.update_or_create(
            username="demo-kader",
            defaults={"first_name": "Kader", "last_name": "Yao", "email": "kader.yao@orgatech.ci", "is_active": True},
        )
        profile, _ = UserProfile.objects.update_or_create(
            user=user,
            defaults={"keycloak_subject": "bootstrap:kader", "organization_unit": units["DSI"], "title": "Chef de projet", "roles": ["configurateur", "gestionnaire"]},
        )
        sync_role_assignments(profile, ["configurateur", "gestionnaire"], source="migration")
        sync_service_membership(profile)
        records = [
            ("EXT-DSI-0042/2026", "external", "Société KORHOGO BTP", "Demande de partenariat technique", "DT", "DSI", "high", "standard", "in_validation"),
            ("EXT-DIP-0040/2026", "external", "Fournitures Générales CI", "Notification de livraison — Lot 3", "DIP", "DIP", "normal", "standard", "signed"),
            ("INT-SG-0187/2026", "internal", "Direction générale", "Note de service — Congés août", "SG", "SG", "urgent", "restricted", "to_process"),
        ]
        for reference, registry, sender, subject, direction, service, priority, confidentiality, status in records:
            item, _ = Correspondence.objects.update_or_create(
                reference=reference,
                defaults={
                    "registry": registry, "sender": sender, "received_at": date(2026, 8, 13), "subject": subject,
                    "direction": units[direction], "responsible_service": units[service], "priority": priority,
                    "confidentiality": confidentiality, "status": status, "created_by": user,
                    "summary": "Donnée de démonstration destinée au raccordement du prototype.",
                },
            )
            grant_default_correspondence_access(item, user)
            if item.status != Correspondence.Status.DRAFT:
                WorkflowInstance.objects.get_or_create(
                    correspondence=item,
                    defaults={
                        "status": WorkflowInstance.Status.COMPLETED if item.status in {Correspondence.Status.VALIDATED, Correspondence.Status.SIGNED, Correspondence.Status.ARCHIVED} else WorkflowInstance.Status.RUNNING,
                        "current_step": item.status,
                        "started_by": user,
                    },
                )
        OrganizationSettings.objects.update_or_create(singleton=1, defaults={"configured": True})
        self.stdout.write(self.style.SUCCESS("Données de démonstration NUMA prêtes."))
