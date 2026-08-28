from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Notification


@receiver(post_save, sender=Notification)
def enqueue_notification_email(sender, instance, created, **kwargs):
    if not instance.email_requested or instance.email_sent_at:
        return

    def enqueue():
        from .tasks import send_notification_email

        send_notification_email.delay(str(instance.pk))

    transaction.on_commit(enqueue)
