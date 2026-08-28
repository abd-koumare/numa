from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.core"
    verbose_name = "NUMA"

    def ready(self):
        from . import checks  # noqa: F401
        from . import schema  # noqa: F401
        from . import signals  # noqa: F401
