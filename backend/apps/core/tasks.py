import csv
import hashlib
import hmac
import io
import json
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path

import clamd
import requests
from celery import shared_task
from django.conf import settings
from django.core.files import File
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from .backup import create_encrypted_bundle, sha256_file, upload_backup_to_s3
from .crypto import decrypt_secret
from .models import (
    BackupJob,
    Correspondence,
    DocumentVersion,
    Notification,
    OrganizationUnit,
    TransferJob,
    WebhookDelivery,
)
from .services import grant_default_correspondence_access, record_audit


@shared_task(bind=True, autoretry_for=(OSError,), retry_backoff=True, max_retries=5)
def scan_document(self, document_id):
    document = DocumentVersion.objects.select_related("created_by").get(pk=document_id)
    try:
        client = clamd.ClamdNetworkSocket(host=settings.CLAMAV_HOST, port=settings.CLAMAV_PORT, timeout=30)
        with document.file.open("rb") as content:
            result = client.instream(content)
        scan_status, signature = result.get("stream", ("ERROR", "Réponse ClamAV invalide"))
        document.scan_status = DocumentVersion.ScanStatus.CLEAN if scan_status == "OK" else DocumentVersion.ScanStatus.INFECTED
        document.save(update_fields=["scan_status"])
        record_audit(
            actor=document.created_by,
            action="document.scanned",
            resource_type="document",
            resource_id=document.document_id or document.id,
            metadata={"version_id": str(document.id), "status": document.scan_status, "signature": signature},
        )
        if document.scan_status == DocumentVersion.ScanStatus.CLEAN:
            extract_document_text.delay(str(document.id))
    except clamd.ClamdError:
        document.scan_status = DocumentVersion.ScanStatus.ERROR
        document.save(update_fields=["scan_status"])
        raise


def _ocr_image(image) -> str:
    import pytesseract

    return pytesseract.image_to_string(image, lang=settings.OCR_LANGUAGES, timeout=settings.OCR_PAGE_TIMEOUT)


def _extract_text(document: DocumentVersion) -> tuple[str, str]:
    mime_type = document.detected_mime_type or document.mime_type
    with document.file.open("rb") as content:
        if mime_type == "application/pdf":
            from pypdf import PdfReader

            reader = PdfReader(content)
            text = "\n".join((page.extract_text() or "") for page in reader.pages[: settings.OCR_MAX_PAGES])
            if len(text.strip()) >= settings.OCR_MIN_NATIVE_CHARACTERS:
                return text, DocumentVersion.ExtractionStatus.COMPLETE
            content.seek(0)
            from pdf2image import convert_from_bytes

            images = convert_from_bytes(
                content.read(),
                dpi=settings.OCR_DPI,
                first_page=1,
                last_page=min(len(reader.pages), settings.OCR_MAX_PAGES),
                fmt="jpeg",
                thread_count=1,
            )
            return "\n".join(_ocr_image(image) for image in images), DocumentVersion.ExtractionStatus.COMPLETE
        if mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            from docx import Document as WordDocument

            word = WordDocument(content)
            return "\n".join(paragraph.text for paragraph in word.paragraphs), DocumentVersion.ExtractionStatus.COMPLETE
        if mime_type in {"image/jpeg", "image/png"}:
            from PIL import Image

            return _ocr_image(Image.open(content)), DocumentVersion.ExtractionStatus.COMPLETE
    return "", DocumentVersion.ExtractionStatus.UNSUPPORTED


@shared_task(bind=True, autoretry_for=(OSError,), retry_backoff=True, max_retries=3)
def extract_document_text(self, document_id):
    document = DocumentVersion.objects.select_related("created_by").get(pk=document_id)
    if document.scan_status != DocumentVersion.ScanStatus.CLEAN:
        return
    try:
        text, extraction_status = _extract_text(document)
        document.extracted_text = text[: settings.MAX_EXTRACTED_TEXT_LENGTH]
        document.extraction_status = extraction_status
        document.extraction_error = ""
        document.save(update_fields=["extracted_text", "extraction_status", "extraction_error"])
        record_audit(
            actor=document.created_by,
            action="document.text_extracted",
            resource_type="document",
            resource_id=document.document_id or document.id,
            metadata={"version_id": str(document.id), "status": extraction_status, "characters": len(document.extracted_text)},
        )
    except Exception as exc:
        document.extraction_status = DocumentVersion.ExtractionStatus.ERROR
        document.extraction_error = str(exc)[:2000]
        document.save(update_fields=["extraction_status", "extraction_error"])
        raise


@shared_task(bind=True, autoretry_for=(OSError,), retry_backoff=True, max_retries=5)
def send_notification_email(self, notification_id):
    notification = Notification.objects.select_related("recipient").get(pk=notification_id)
    if notification.email_sent_at or not notification.email_requested or not notification.recipient.email:
        return
    send_mail(
        subject=f"[{settings.NUMA_PRODUCT_NAME}] {notification.title}",
        message=f"{notification.detail}\n\n{settings.NUMA_PUBLIC_URL.rstrip('/')}{notification.path}",
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[notification.recipient.email],
        fail_silently=False,
    )
    notification.email_sent_at = timezone.now()
    notification.save(update_fields=["email_sent_at"])


@shared_task
def send_requested_notification_emails():
    identifiers = Notification.objects.filter(email_requested=True, email_sent_at__isnull=True).values_list("id", flat=True)[:500]
    for identifier in identifiers:
        send_notification_email.delay(str(identifier))


@shared_task(bind=True, autoretry_for=(requests.RequestException,), retry_backoff=True, max_retries=6)
def deliver_webhook(self, delivery_id):
    delivery = WebhookDelivery.objects.select_related("endpoint").get(pk=delivery_id)
    body = json.dumps(delivery.payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    secret = decrypt_secret(delivery.endpoint.secret_encrypted)
    headers = {
        "Content-Type": "application/json",
        "X-NUMA-Event": delivery.event,
        "X-NUMA-Delivery": str(delivery.id),
    }
    if secret:
        headers["X-NUMA-Signature-256"] = "sha256=" + hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    response = requests.post(delivery.endpoint.url, data=body, headers=headers, timeout=settings.WEBHOOK_TIMEOUT_SECONDS)
    delivery.response_status = response.status_code
    delivery.response_body = response.text[:4000]
    if 200 <= response.status_code < 300:
        delivery.delivered_at = timezone.now()
    else:
        delivery.attempt += 1
        delivery.next_attempt_at = timezone.now()
    delivery.save(update_fields=["response_status", "response_body", "delivered_at", "attempt", "next_attempt_at"])
    response.raise_for_status()


def _export_correspondences(job: TransferJob):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "reference", "registry", "sender", "received_at", "subject", "direction", "service", "priority", "confidentiality", "status", "due_at", "summary"])
    queryset = Correspondence.objects.select_related("direction", "responsible_service").order_by("created_at")
    for item in queryset.iterator(chunk_size=1000):
        writer.writerow([
            item.id, item.reference or "", item.registry, item.sender, item.received_at, item.subject,
            item.direction.code, item.responsible_service.code, item.priority, item.confidentiality,
            item.status, item.due_at or "", item.summary,
        ])
    content = output.getvalue().encode("utf-8-sig")
    filename = f"numa-correspondences-{timezone.now():%Y%m%d-%H%M%S}.csv"
    job.result_file.save(filename, File(io.BytesIO(content)), save=False)
    return {"exported": queryset.count(), "sha256": hashlib.sha256(content).hexdigest()}


def _import_correspondences(job: TransferJob):
    if not job.source_file:
        raise ValueError("Le fichier source est obligatoire.")
    created = 0
    errors = []
    with job.source_file.open("rb") as raw:
        text = io.TextIOWrapper(raw, encoding=job.options.get("encoding", "utf-8-sig"), newline="")
        reader = csv.DictReader(text)
        mapping = job.options.get("mapping", {})
        available_targets = set(mapping.values()) | set(reader.fieldnames or [])
        required = {"sender", "received_at", "subject", "direction"}
        if not reader.fieldnames or required - available_targets:
            raise ValueError(f"Champs obligatoires non mappés : {', '.join(sorted(required - available_targets))}")
        for row_number, row in enumerate(reader, start=2):
            try:
                with transaction.atomic():
                    normalized = dict(row)
                    for source, target in mapping.items():
                        if source in row and target:
                            normalized[target] = row[source]
                    direction = OrganizationUnit.objects.get(code=normalized["direction"].strip(), active=True)
                    service = OrganizationUnit.objects.get(code=(normalized.get("service") or normalized["direction"]).strip(), active=True)
                    received_value = normalized["received_at"].strip()
                    received_at = None
                    for date_format in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
                        try:
                            received_at = datetime.strptime(received_value, date_format).date()
                            break
                        except ValueError:
                            continue
                    if received_at is None:
                        raise ValueError(f"Date invalide : {received_value}")
                    priority_values = {"basse": "low", "normale": "normal", "haute": "high", "urgente": "urgent"}
                    priority = priority_values.get(normalized.get("priority", "").strip().lower(), normalized.get("priority") or Correspondence.Priority.NORMAL)
                    item = Correspondence.objects.create(
                        registry=normalized.get("registry") or job.options.get("registry") or Correspondence.Registry.EXTERNAL,
                        sender=normalized["sender"].strip(),
                        received_at=received_at,
                        subject=normalized["subject"].strip(),
                        origin_reference=normalized.get("origin_reference", "").strip(),
                        channel=normalized.get("channel") or Correspondence.Channel.EMAIL,
                        direction=direction,
                        responsible_service=service,
                        priority=priority,
                        confidentiality=normalized.get("confidentiality") or Correspondence.Confidentiality.STANDARD,
                        due_at=normalized.get("due_at") or None,
                        summary=normalized.get("summary", ""),
                        created_by=job.created_by,
                    )
                    grant_default_correspondence_access(item, job.created_by)
                    created += 1
            except Exception as exc:
                errors.append({"row": row_number, "error": str(exc)[:500]})
                if len(errors) >= settings.IMPORT_MAX_ERRORS:
                    break
    return {"created": created, "errors": errors, "partial": bool(errors)}


@shared_task
def process_transfer_job(job_id):
    job = TransferJob.objects.select_related("created_by").get(pk=job_id)
    job.status = TransferJob.Status.RUNNING
    job.save(update_fields=["status"])
    try:
        if job.kind == TransferJob.Kind.EXPORT and job.resource_type == "correspondence":
            result = _export_correspondences(job)
        elif job.kind == TransferJob.Kind.IMPORT and job.resource_type == "correspondence":
            result = _import_correspondences(job)
        else:
            raise ValueError("Ce type de transfert n’est pas pris en charge.")
        job.status = TransferJob.Status.COMPLETE
        job.result = result
        job.completed_at = timezone.now()
        job.save(update_fields=["status", "result", "result_file", "completed_at"])
        record_audit(actor=job.created_by, action=f"transfer.{job.kind}.completed", resource_type="transfer_job", resource_id=job.id, metadata=result)
    except Exception as exc:
        job.status = TransferJob.Status.FAILED
        job.error = str(exc)[:4000]
        job.completed_at = timezone.now()
        job.save(update_fields=["status", "error", "completed_at"])
        raise


@shared_task
def create_backup(job_id):
    job = BackupJob.objects.select_related("requested_by").get(pk=job_id)
    job.status = BackupJob.Status.RUNNING
    job.save(update_fields=["status"])
    backup_root = Path(settings.NUMA_BACKUP_DIR)
    backup_root.mkdir(parents=True, exist_ok=True)
    try:
        with tempfile.TemporaryDirectory(dir=backup_root) as temporary:
            temporary_path = Path(temporary)
            database_dump = temporary_path / "numa-postgres.dump"
            command = [
                "pg_dump",
                "--format=custom",
                "--no-password",
                "--file",
                str(database_dump),
                "--host",
                settings.DATABASES["default"]["HOST"],
                "--port",
                str(settings.DATABASES["default"].get("PORT") or 5432),
                "--username",
                settings.DATABASES["default"]["USER"],
                settings.DATABASES["default"]["NAME"],
            ]
            environment = {"PGPASSWORD": settings.DATABASES["default"]["PASSWORD"]}
            subprocess.run(command, check=True, env={**settings.NUMA_SUBPROCESS_ENV, **environment}, timeout=settings.BACKUP_TIMEOUT_SECONDS)
            archive = backup_root / f"numa-{timezone.now():%Y%m%d-%H%M%S}-{str(job.id)[:8]}.numa"
            manifest = create_encrypted_bundle(database_dump, archive)
        locations = []
        if job.destination in {BackupJob.Destination.LOCAL, BackupJob.Destination.BOTH}:
            locations.append(f"local:{archive}")
        if job.destination in {BackupJob.Destination.S3, BackupJob.Destination.BOTH}:
            locations.append(upload_backup_to_s3(archive))
        checksum = sha256_file(archive)
        job.status = BackupJob.Status.COMPLETE
        job.location = ";".join(locations)
        job.checksum = checksum
        job.size = archive.stat().st_size
        job.completed_at = timezone.now()
        job.save(update_fields=["status", "location", "checksum", "size", "completed_at"])
        record_audit(actor=job.requested_by, action="backup.completed", resource_type="backup_job", resource_id=job.id, metadata={"checksum": checksum, "size": job.size, "destination": job.destination, "documents": len(manifest["documents"])})
        if job.destination == BackupJob.Destination.S3 and not settings.NUMA_BACKUP_KEEP_LOCAL_AFTER_S3:
            archive.unlink()
    except Exception as exc:
        job.status = BackupJob.Status.FAILED
        job.error = str(exc)[:4000]
        job.completed_at = timezone.now()
        job.save(update_fields=["status", "error", "completed_at"])
        raise
