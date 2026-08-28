import hashlib
import subprocess
import tempfile
import uuid
from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError

from apps.core.backup import extract_and_validate_bundle


class Command(BaseCommand):
    help = "Restaure hors ligne une sauvegarde NUMA après vérification intégrale."

    def add_arguments(self, parser):
        parser.add_argument("backup")
        parser.add_argument("--confirm", required=True)
        parser.add_argument("--staging-dir", default="")
        parser.add_argument("--skip-documents", action="store_true")

    @staticmethod
    def _storage_checksum(name: str) -> str:
        digest = hashlib.sha256()
        with default_storage.open(name, "rb") as content:
            for chunk in iter(lambda: content.read(8 * 1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def _assert_storage_object(self, name: str, document: dict):
        if not default_storage.exists(name):
            raise CommandError(f"Le document temporaire {name} est absent du stockage.")
        if default_storage.size(name) != document["size"] or self._storage_checksum(name) != document["sha256"]:
            raise CommandError(f"Le document {document.get('version_id', '')} est altéré dans le stockage.")

    @staticmethod
    def _save_path(source: Path, target_name: str) -> str:
        with source.open("rb") as content:
            saved_name = default_storage.save(target_name, File(content, name=Path(target_name).name))
        if saved_name != target_name:
            default_storage.delete(saved_name)
            raise CommandError(f"Le stockage a renommé {target_name} en {saved_name}.")
        return saved_name

    @staticmethod
    def _copy_storage_object(source_name: str, target_name: str) -> str:
        with default_storage.open(source_name, "rb") as content:
            saved_name = default_storage.save(target_name, File(content, name=Path(target_name).name))
        if saved_name != target_name:
            default_storage.delete(saved_name)
            raise CommandError(f"Le stockage a renommé {target_name} en {saved_name}.")
        return saved_name

    def _stage_documents(self, restored: dict, restore_id: str) -> list[tuple[dict, str]]:
        staged: list[tuple[dict, str]] = []
        try:
            for index, document in enumerate(restored["manifest"].get("documents", [])):
                source = restored["extracted"] / document["archive_name"]
                temporary_name = f"_numa_restore/{restore_id}/new/{index:08d}"
                self._save_path(source, temporary_name)
                staged.append((document, temporary_name))
                self._assert_storage_object(temporary_name, document)
        except Exception:
            for _, temporary_name in staged:
                default_storage.delete(temporary_name)
            raise
        return staged

    def _promote_documents(self, staged: list[tuple[dict, str]], restore_id: str) -> list[str]:
        rollback_names: list[str] = []
        promoted: list[tuple[str, str | None]] = []
        try:
            for index, (document, temporary_name) in enumerate(staged):
                storage_name = document["storage_name"]
                rollback_name = None
                if default_storage.exists(storage_name):
                    rollback_name = f"_numa_restore/{restore_id}/previous/{index:08d}"
                    self._copy_storage_object(storage_name, rollback_name)
                    rollback_names.append(rollback_name)
                promoted.append((storage_name, rollback_name))
                default_storage.delete(storage_name)
                self._copy_storage_object(temporary_name, storage_name)
                self._assert_storage_object(storage_name, document)
        except Exception as exc:
            rollback_errors = []
            for storage_name, rollback_name in reversed(promoted):
                try:
                    default_storage.delete(storage_name)
                    if rollback_name:
                        self._copy_storage_object(rollback_name, storage_name)
                except Exception as rollback_exc:
                    rollback_errors.append(str(rollback_exc))
            self._cleanup_storage(rollback_names)
            suffix = f" Échec du retour arrière documentaire : {'; '.join(rollback_errors)}" if rollback_errors else ""
            raise CommandError(f"La promotion des documents a échoué.{suffix}") from exc
        return rollback_names

    @staticmethod
    def _cleanup_storage(names: list[str]):
        for name in names:
            try:
                default_storage.delete(name)
            except Exception:
                continue

    def handle(self, *args, **options):
        if options["confirm"] != "RESTORE-NUMA":
            raise CommandError("Confirmation invalide : utilisez --confirm RESTORE-NUMA.")
        backup = Path(options["backup"]).resolve()
        if not backup.is_file():
            raise CommandError(f"Sauvegarde introuvable : {backup}")
        staging_parent = Path(options["staging_dir"]).resolve() if options["staging_dir"] else Path(settings.NUMA_BACKUP_DIR)
        staging_parent.mkdir(parents=True, exist_ok=True)
        temporary_storage_names: list[str] = []
        try:
            with tempfile.TemporaryDirectory(prefix="numa-restore-", dir=staging_parent) as temporary:
                restored = extract_and_validate_bundle(backup, Path(temporary))
                restore_id = uuid.uuid4().hex
                staged_documents = []
                if not options["skip_documents"]:
                    staged_documents = self._stage_documents(restored, restore_id)
                    temporary_storage_names.extend(name for _, name in staged_documents)
                database = settings.DATABASES["default"]
                environment = {**settings.NUMA_SUBPROCESS_ENV, "PGPASSWORD": database["PASSWORD"]}
                command = [
                    "pg_restore", "--clean", "--if-exists", "--no-owner", "--no-privileges", "--exit-on-error",
                    "--host", database["HOST"], "--port", str(database.get("PORT") or 5432),
                    "--username", database["USER"], "--dbname", database["NAME"], str(restored["database"]),
                ]
                subprocess.run(command, check=True, env=environment, timeout=settings.BACKUP_TIMEOUT_SECONDS)
                if staged_documents:
                    temporary_storage_names.extend(self._promote_documents(staged_documents, restore_id))
        except CommandError:
            raise
        except (OSError, ValueError, subprocess.SubprocessError) as exc:
            raise CommandError(str(exc)) from exc
        finally:
            self._cleanup_storage(temporary_storage_names)
        self.stdout.write(self.style.SUCCESS("Sauvegarde restaurée et contrôlée. Redémarrez NUMA puis exécutez les vérifications."))
