import json

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError

from apps.core.models import BackupJob
from apps.core.tasks import create_backup


class Command(BaseCommand):
    help = "Crée immédiatement une sauvegarde NUMA chiffrée et vérifiée."

    def add_arguments(self, parser):
        parser.add_argument("--destination", choices=["local", "s3", "both"], default="both")

    def handle(self, *args, **options):
        user = User.objects.filter(numa_profile__role_assignments__role_id="super-admin", is_active=True).distinct().first()
        user = user or User.objects.filter(is_superuser=True, is_active=True).first() or User.objects.filter(is_active=True).first()
        if user is None:
            raise CommandError("Aucun utilisateur actif ne peut porter l’événement de sauvegarde.")
        job = BackupJob.objects.create(requested_by=user, destination=options["destination"], encrypted=True)
        create_backup.run(str(job.id))
        job.refresh_from_db()
        if job.status != BackupJob.Status.COMPLETE:
            raise CommandError(job.error or "La sauvegarde a échoué.")
        self.stdout.write(json.dumps({"id": str(job.id), "location": job.location, "checksum": job.checksum, "size": job.size}))
