import hashlib
import io
import json
import shutil
import tarfile

import pytest

from apps.core.backup import extract_and_validate_bundle


def _write_archive(path, members):
    with tarfile.open(path, mode="w:gz") as archive:
        for name, payload in members:
            info = tarfile.TarInfo(name)
            info.size = len(payload)
            archive.addfile(info, io.BytesIO(payload))


def _manifest(database_payload, documents=None):
    return {
        "format": "NUMA-BACKUP-V1",
        "version": "test",
        "created_at": "2026-08-27T00:00:00Z",
        "database": {
            "archive_name": "database/numa-postgres.dump",
            "size": len(database_payload),
            "sha256": hashlib.sha256(database_payload).hexdigest(),
        },
        "documents": documents or [],
    }


def _extract_from_plain_archive(monkeypatch, tmp_path, members):
    plain_archive = tmp_path / "fixture.tar.gz"
    encrypted = tmp_path / "fixture.numa"
    staging = tmp_path / "staging"
    encrypted.touch()
    staging.mkdir()
    _write_archive(plain_archive, members)
    monkeypatch.setattr("apps.core.backup.verify_encrypted_bundle", lambda path: {"valid": True})
    monkeypatch.setattr("apps.core.backup.decrypt_bundle", lambda path, destination: shutil.copyfile(plain_archive, destination))
    return extract_and_validate_bundle(encrypted, staging)


def test_extract_and_validate_bundle_streams_a_valid_archive(monkeypatch, tmp_path):
    database = b"postgres-dump"
    manifest = json.dumps(_manifest(database)).encode()

    restored = _extract_from_plain_archive(
        monkeypatch,
        tmp_path,
        [("database/numa-postgres.dump", database), ("manifest.json", manifest)],
    )

    assert restored["database"].read_bytes() == database
    assert restored["manifest"]["format"] == "NUMA-BACKUP-V1"


def test_extract_and_validate_bundle_rejects_path_traversal(monkeypatch, tmp_path):
    with pytest.raises(ValueError, match="chemin non sûr"):
        _extract_from_plain_archive(monkeypatch, tmp_path, [("../outside.txt", b"unsafe")])
    assert not (tmp_path / "outside.txt").exists()


def test_extract_and_validate_bundle_rejects_unlisted_files(monkeypatch, tmp_path):
    database = b"postgres-dump"
    manifest = json.dumps(_manifest(database)).encode()

    with pytest.raises(ValueError, match="absents du manifeste"):
        _extract_from_plain_archive(
            monkeypatch,
            tmp_path,
            [
                ("database/numa-postgres.dump", database),
                ("documents/unlisted/1-file.pdf", b"document"),
                ("manifest.json", manifest),
            ],
        )


def test_extract_and_validate_bundle_rejects_unsafe_storage_names(monkeypatch, tmp_path):
    database = b"postgres-dump"
    document = b"document"
    archive_name = "documents/123/1-file.pdf"
    documents = [{
        "version_id": "123",
        "document_id": "456",
        "storage_name": "../outside.pdf",
        "archive_name": archive_name,
        "size": len(document),
        "sha256": hashlib.sha256(document).hexdigest(),
    }]
    manifest = json.dumps(_manifest(database, documents)).encode()

    with pytest.raises(ValueError, match="nom de stockage"):
        _extract_from_plain_archive(
            monkeypatch,
            tmp_path,
            [
                ("database/numa-postgres.dump", database),
                (archive_name, document),
                ("manifest.json", manifest),
            ],
        )
