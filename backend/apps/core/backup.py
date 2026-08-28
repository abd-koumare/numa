from __future__ import annotations

import base64
import gzip
import hashlib
import hmac
import io
import json
import os
import re
import tarfile
from pathlib import Path
from pathlib import PurePosixPath

import boto3
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from django.conf import settings
from django.core.files.storage import default_storage
from django.utils import timezone

from .models import DocumentVersion


MAGIC = b"NUMA-BACKUP-V1\0"
NONCE_SIZE = 12
TAG_SIZE = 16
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


def _encryption_key() -> bytes:
    configured = settings.NUMA_BACKUP_ENCRYPTION_KEY.strip()
    if not configured:
        raise ValueError("NUMA_BACKUP_ENCRYPTION_KEY n’est pas configurée.")
    try:
        key = base64.urlsafe_b64decode(configured.encode("ascii"))
    except (ValueError, UnicodeEncodeError) as exc:
        raise ValueError("NUMA_BACKUP_ENCRYPTION_KEY n’est pas une clé Fernet valide.") from exc
    if len(key) != 32:
        raise ValueError("NUMA_BACKUP_ENCRYPTION_KEY doit contenir 32 octets encodés en base64 URL-safe.")
    return key


class _EncryptingWriter:
    def __init__(self, target, encryptor):
        self.target = target
        self.encryptor = encryptor

    def write(self, data):
        encrypted = self.encryptor.update(data)
        self.target.write(encrypted)
        return len(data)

    def flush(self):
        self.target.flush()


class _HashingReader:
    def __init__(self, source):
        self.source = source
        self.digest = hashlib.sha256()

    def read(self, size=-1):
        value = self.source.read(size)
        if value:
            self.digest.update(value)
        return value

    @property
    def hexdigest(self):
        return self.digest.hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as content:
        for chunk in iter(lambda: content.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def create_encrypted_bundle(database_dump: Path, destination: Path) -> dict:
    nonce = os.urandom(NONCE_SIZE)
    encryptor = Cipher(algorithms.AES(_encryption_key()), modes.GCM(nonce)).encryptor()
    inventory = []
    with destination.open("wb") as raw:
        raw.write(MAGIC)
        raw.write(nonce)
        encrypted_writer = _EncryptingWriter(raw, encryptor)
        with gzip.GzipFile(fileobj=encrypted_writer, mode="wb", compresslevel=6, mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode="w|") as archive:
                archive.add(database_dump, arcname="database/numa-postgres.dump", recursive=False)
                versions = DocumentVersion.objects.exclude(file="").only("id", "document_id", "version", "file", "size").iterator(chunk_size=500)
                for version in versions:
                    source_name = version.file.name
                    if not default_storage.exists(source_name):
                        raise FileNotFoundError(f"Objet documentaire absent : {source_name}")
                    object_size = default_storage.size(source_name)
                    arcname = f"documents/{version.document_id or version.id}/{version.version}-{Path(source_name).name}"
                    info = tarfile.TarInfo(arcname)
                    info.size = object_size
                    info.mtime = int(timezone.now().timestamp())
                    info.mode = 0o600
                    with default_storage.open(source_name, "rb") as source:
                        hashing_source = _HashingReader(source)
                        archive.addfile(info, hashing_source)
                    inventory.append({
                        "version_id": str(version.id),
                        "document_id": str(version.document_id or ""),
                        "storage_name": source_name,
                        "archive_name": arcname,
                        "size": object_size,
                        "sha256": hashing_source.hexdigest,
                    })
                manifest = {
                    "format": "NUMA-BACKUP-V1",
                    "version": settings.NUMA_VERSION,
                    "created_at": timezone.now().isoformat(),
                    "database": {"archive_name": "database/numa-postgres.dump", "sha256": sha256_file(database_dump), "size": database_dump.stat().st_size},
                    "documents": inventory,
                }
                payload = json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2).encode("utf-8")
                info = tarfile.TarInfo("manifest.json")
                info.size = len(payload)
                info.mtime = int(timezone.now().timestamp())
                info.mode = 0o600
                archive.addfile(info, io.BytesIO(payload))
        raw.write(encryptor.finalize())
        raw.write(encryptor.tag)
    verify_encrypted_bundle(destination)
    return manifest


def verify_encrypted_bundle(path: Path) -> dict:
    size = path.stat().st_size
    minimum = len(MAGIC) + NONCE_SIZE + TAG_SIZE
    if size <= minimum:
        raise ValueError("Sauvegarde NUMA tronquée.")
    with path.open("rb") as source:
        if source.read(len(MAGIC)) != MAGIC:
            raise ValueError("Format de sauvegarde NUMA inconnu.")
        nonce = source.read(NONCE_SIZE)
        source.seek(-TAG_SIZE, os.SEEK_END)
        tag = source.read(TAG_SIZE)
        ciphertext_size = size - minimum
        source.seek(len(MAGIC) + NONCE_SIZE)
        decryptor = Cipher(algorithms.AES(_encryption_key()), modes.GCM(nonce, tag)).decryptor()
        remaining = ciphertext_size
        plaintext_size = 0
        while remaining:
            chunk = source.read(min(8 * 1024 * 1024, remaining))
            if not chunk:
                raise ValueError("Sauvegarde NUMA tronquée.")
            remaining -= len(chunk)
            plaintext_size += len(decryptor.update(chunk))
        plaintext_size += len(decryptor.finalize())
    return {"valid": True, "encrypted_size": size, "plaintext_size": plaintext_size, "sha256": sha256_file(path)}


def decrypt_bundle(path: Path, destination: Path):
    size = path.stat().st_size
    minimum = len(MAGIC) + NONCE_SIZE + TAG_SIZE
    if size <= minimum:
        raise ValueError("Sauvegarde NUMA tronquée.")
    with path.open("rb") as source, destination.open("wb") as target:
        if source.read(len(MAGIC)) != MAGIC:
            raise ValueError("Format de sauvegarde NUMA inconnu.")
        nonce = source.read(NONCE_SIZE)
        source.seek(-TAG_SIZE, os.SEEK_END)
        tag = source.read(TAG_SIZE)
        remaining = size - minimum
        source.seek(len(MAGIC) + NONCE_SIZE)
        decryptor = Cipher(algorithms.AES(_encryption_key()), modes.GCM(nonce, tag)).decryptor()
        while remaining:
            chunk = source.read(min(8 * 1024 * 1024, remaining))
            if not chunk:
                raise ValueError("Sauvegarde NUMA tronquée.")
            remaining -= len(chunk)
            target.write(decryptor.update(chunk))
        target.write(decryptor.finalize())


def _safe_relative_name(value: object, *, label: str) -> PurePosixPath:
    if not isinstance(value, str) or not value or "\\" in value or "\x00" in value:
        raise ValueError(f"{label} est invalide.")
    raw_parts = value.split("/")
    relative = PurePosixPath(value)
    if relative.is_absolute() or any(part in {"", ".", ".."} for part in raw_parts):
        raise ValueError(f"{label} contient un chemin non sûr.")
    return relative


def _manifest_file(metadata: object, *, label: str, required_prefix: str | None = None) -> tuple[str, int, str]:
    if not isinstance(metadata, dict):
        raise ValueError(f"{label} est invalide dans le manifeste.")
    archive_name = str(metadata.get("archive_name", ""))
    relative = _safe_relative_name(archive_name, label=f"Le chemin de {label}")
    if required_prefix and (not relative.parts or relative.parts[0] != required_prefix):
        raise ValueError(f"Le chemin de {label} n’est pas autorisé.")
    size = metadata.get("size")
    checksum = metadata.get("sha256")
    if not isinstance(size, int) or isinstance(size, bool) or size < 0:
        raise ValueError(f"La taille de {label} est invalide.")
    if not isinstance(checksum, str) or not SHA256_PATTERN.fullmatch(checksum):
        raise ValueError(f"L’empreinte de {label} est invalide.")
    return archive_name, size, checksum


def _matches_manifest(observed: dict, name: str, size: int, checksum: str, *, label: str):
    actual = observed.get(name)
    if actual is None:
        raise ValueError(f"{label} est absent de la sauvegarde.")
    if actual["size"] != size or not hmac.compare_digest(actual["sha256"], checksum):
        raise ValueError(f"{label} ne correspond pas au manifeste.")


def extract_and_validate_bundle(path: Path, staging_directory: Path) -> dict:
    encrypted_check = verify_encrypted_bundle(path)
    compressed_bundle = staging_directory / "numa-bundle.tar.gz"
    extracted = staging_directory / "extracted"
    extracted.mkdir(parents=True, exist_ok=True)
    decrypt_bundle(path, compressed_bundle)
    observed: dict[str, dict[str, int | str]] = {}
    extracted_size = 0
    member_count = 0
    maximum_size = settings.NUMA_BACKUP_MAX_EXTRACTED_BYTES
    maximum_members = settings.NUMA_BACKUP_MAX_MEMBERS
    try:
        with tarfile.open(compressed_bundle, mode="r|gz") as archive:
            for member in archive:
                member_count += 1
                if member_count > maximum_members:
                    raise ValueError("La sauvegarde contient trop de fichiers.")
                relative = _safe_relative_name(member.name, label="Un chemin de la sauvegarde")
                name = relative.as_posix()
                if name in observed:
                    raise ValueError(f"Le fichier {name} apparaît plusieurs fois dans la sauvegarde.")
                if not member.isfile():
                    raise ValueError("La sauvegarde contient un type de fichier interdit.")
                if name != "manifest.json" and name != "database/numa-postgres.dump" and relative.parts[0] != "documents":
                    raise ValueError(f"Le fichier {name} n’est pas autorisé dans une sauvegarde NUMA.")
                if member.size < 0:
                    raise ValueError(f"La taille du fichier {name} est invalide.")
                extracted_size += member.size
                if extracted_size > maximum_size:
                    raise ValueError("La sauvegarde dépasse la taille décompressée autorisée.")
                source = archive.extractfile(member)
                if source is None:
                    raise ValueError(f"Le fichier {name} est illisible.")
                target = extracted.joinpath(*relative.parts)
                target.parent.mkdir(parents=True, exist_ok=True)
                digest = hashlib.sha256()
                remaining = member.size
                with target.open("xb") as output:
                    while remaining:
                        chunk = source.read(min(8 * 1024 * 1024, remaining))
                        if not chunk:
                            raise ValueError(f"Le fichier {name} est tronqué.")
                        output.write(chunk)
                        digest.update(chunk)
                        remaining -= len(chunk)
                observed[name] = {"size": member.size, "sha256": digest.hexdigest()}
    except (tarfile.TarError, EOFError, OSError) as exc:
        raise ValueError("L’archive interne de la sauvegarde est invalide.") from exc
    manifest_path = extracted / "manifest.json"
    if not manifest_path.is_file():
        raise ValueError("Le manifeste de sauvegarde est absent.")
    if manifest_path.stat().st_size > settings.NUMA_BACKUP_MANIFEST_MAX_BYTES:
        raise ValueError("Le manifeste de sauvegarde est trop volumineux.")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Le manifeste de sauvegarde est invalide.") from exc
    if not isinstance(manifest, dict) or manifest.get("format") != "NUMA-BACKUP-V1":
        raise ValueError("Le format du manifeste de sauvegarde est inconnu.")

    database_name, database_size, database_checksum = _manifest_file(manifest.get("database"), label="du dump PostgreSQL")
    if database_name != "database/numa-postgres.dump":
        raise ValueError("Le chemin du dump PostgreSQL n’est pas autorisé.")
    _matches_manifest(observed, database_name, database_size, database_checksum, label="Le dump PostgreSQL")

    documents = manifest.get("documents", [])
    if not isinstance(documents, list):
        raise ValueError("L’inventaire documentaire du manifeste est invalide.")
    expected_names = {"manifest.json", database_name}
    storage_names: set[str] = set()
    for document in documents:
        archive_name, document_size, document_checksum = _manifest_file(
            document,
            label=f"du document {document.get('version_id', '') if isinstance(document, dict) else ''}",
            required_prefix="documents",
        )
        storage_name = document.get("storage_name") if isinstance(document, dict) else None
        _safe_relative_name(storage_name, label="Le nom de stockage d’un document")
        if archive_name in expected_names or storage_name in storage_names:
            raise ValueError("L’inventaire documentaire contient un doublon.")
        expected_names.add(archive_name)
        storage_names.add(storage_name)
        _matches_manifest(
            observed,
            archive_name,
            document_size,
            document_checksum,
            label=f"Le document {document.get('version_id', '')}",
        )
    if set(observed) != expected_names:
        raise ValueError("La sauvegarde contient des fichiers absents du manifeste.")
    database = extracted.joinpath(*PurePosixPath(database_name).parts)
    return {"manifest": manifest, "extracted": extracted, "database": database, "encrypted_check": encrypted_check}


def upload_backup_to_s3(path: Path) -> str:
    client = boto3.client(
        "s3",
        endpoint_url=getattr(settings, "AWS_S3_ENDPOINT_URL", None),
        aws_access_key_id=getattr(settings, "AWS_ACCESS_KEY_ID", None),
        aws_secret_access_key=getattr(settings, "AWS_SECRET_ACCESS_KEY", None),
        region_name=getattr(settings, "AWS_S3_REGION_NAME", "us-east-1"),
    )
    bucket = settings.NUMA_BACKUP_S3_BUCKET
    try:
        client.head_bucket(Bucket=bucket)
    except Exception:
        client.create_bucket(Bucket=bucket)
    key = f"{settings.NUMA_BACKUP_S3_PREFIX.strip('/')}/{path.name}".lstrip("/")
    client.upload_file(
        str(path),
        bucket,
        key,
        ExtraArgs={
            "ContentType": "application/vnd.numa.backup",
            "Metadata": {"sha256": sha256_file(path), "numa-version": settings.NUMA_VERSION},
        },
    )
    return f"s3://{bucket}/{key}"
