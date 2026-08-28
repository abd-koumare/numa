import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent


def env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    return [value.strip() for value in os.getenv(name, default).split(",") if value.strip()]


NUMA_VERSION = os.getenv("NUMA_VERSION", "1.0.0")
NUMA_PRODUCT_NAME = os.getenv("NUMA_PRODUCT_NAME", "NUMA")
NUMA_PUBLIC_URL = os.getenv("NUMA_PUBLIC_URL", "http://localhost:5173")
NUMA_SETUP_TOKEN = os.getenv("NUMA_SETUP_TOKEN", "numa-local-setup")
NUMA_ENCRYPTION_KEY = os.getenv("NUMA_ENCRYPTION_KEY", "")
NUMA_BACKUP_DIR = os.getenv("NUMA_BACKUP_DIR", "/var/lib/numa/backups")
NUMA_BACKUP_ENCRYPTION_KEY = os.getenv("NUMA_BACKUP_ENCRYPTION_KEY", NUMA_ENCRYPTION_KEY)
NUMA_BACKUP_S3_BUCKET = os.getenv("NUMA_BACKUP_S3_BUCKET", "numa-backups")
NUMA_BACKUP_S3_PREFIX = os.getenv("NUMA_BACKUP_S3_PREFIX", "backups/")
NUMA_BACKUP_KEEP_LOCAL_AFTER_S3 = env_bool("NUMA_BACKUP_KEEP_LOCAL_AFTER_S3", True)
NUMA_BACKUP_MAX_EXTRACTED_BYTES = int(os.getenv("NUMA_BACKUP_MAX_EXTRACTED_BYTES", str(1024 ** 4)))
NUMA_BACKUP_MAX_MEMBERS = int(os.getenv("NUMA_BACKUP_MAX_MEMBERS", "1000000"))
NUMA_BACKUP_MANIFEST_MAX_BYTES = int(os.getenv("NUMA_BACKUP_MANIFEST_MAX_BYTES", str(32 * 1024 * 1024)))
NUMA_DIGITAL_SIGNATURE_PROVIDER = os.getenv("NUMA_DIGITAL_SIGNATURE_PROVIDER", "disabled")
NUMA_SUBPROCESS_ENV = dict(os.environ)

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "unsafe-development-key-change-me")
DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,api")
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS", NUMA_PUBLIC_URL)

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
    "rest_framework",
    "storages",
    "apps.core",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "apps.core.middleware.RequestIdMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "numa.urls"
TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates",
    "DIRS": [],
    "APP_DIRS": True,
    "OPTIONS": {"context_processors": [
        "django.template.context_processors.request",
        "django.contrib.auth.context_processors.auth",
        "django.contrib.messages.context_processors.messages",
    ]},
}]
WSGI_APPLICATION = "numa.wsgi.application"

if os.getenv("POSTGRES_HOST"):
    DATABASES = {"default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("POSTGRES_DB", "numa"),
        "USER": os.getenv("POSTGRES_USER", "numa"),
        "PASSWORD": os.getenv("POSTGRES_PASSWORD", "numa_dev"),
        "HOST": os.getenv("POSTGRES_HOST", "postgres"),
        "PORT": os.getenv("POSTGRES_PORT", "5432"),
        "CONN_MAX_AGE": int(os.getenv("POSTGRES_CONN_MAX_AGE", "60")),
        "OPTIONS": {"connect_timeout": 5},
    }}
else:
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3"}}

AUTH_PASSWORD_VALIDATORS = []
LANGUAGE_CODE = "fr-fr"
TIME_ZONE = os.getenv("NUMA_TIMEZONE", "UTC")
USE_I18N = True
USE_TZ = True
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_ROOT = BASE_DIR / "media"
MEDIA_URL = "/media/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://localhost:5173")
CORS_ALLOW_CREDENTIALS = False
CORS_ALLOW_HEADERS = [
    "accept",
    "authorization",
    "content-type",
    "if-match",
    "x-request-id",
    "x-setup-token",
]
CORS_EXPOSE_HEADERS = ["ETag", "X-Request-ID"]

OIDC_ISSUER = os.getenv("OIDC_ISSUER", "http://localhost:8080/realms/numa")
OIDC_PUBLIC_ISSUER = os.getenv("OIDC_PUBLIC_ISSUER", OIDC_ISSUER)
OIDC_JWKS_URL = os.getenv("OIDC_JWKS_URL", f"{OIDC_ISSUER}/protocol/openid-connect/certs")
OIDC_AUDIENCE = os.getenv("OIDC_AUDIENCE", "numa-api")
OIDC_WEB_CLIENT_ID = os.getenv("OIDC_WEB_CLIENT_ID", "numa-web")
OIDC_CLOCK_SKEW_SECONDS = int(os.getenv("OIDC_CLOCK_SKEW_SECONDS", "30"))
OIDC_ALLOW_DEV_AUTH = env_bool("OIDC_ALLOW_DEV_AUTH", False)
KEYCLOAK_ADMIN_URL = os.getenv("KEYCLOAK_ADMIN_URL", "http://keycloak:8080")
KEYCLOAK_REALM = os.getenv("KEYCLOAK_REALM", "numa")
KEYCLOAK_ADMIN_USERNAME = os.getenv("KEYCLOAK_ADMIN_USERNAME", os.getenv("KEYCLOAK_ADMIN", "admin"))
KEYCLOAK_ADMIN_PASSWORD = os.getenv("KEYCLOAK_ADMIN_PASSWORD", "")
KEYCLOAK_ADMIN_VERIFY_TLS = env_bool("KEYCLOAK_ADMIN_VERIFY_TLS", True)
IDENTITY_PROVIDER_TIMEOUT_SECONDS = int(os.getenv("IDENTITY_PROVIDER_TIMEOUT_SECONDS", "15"))

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["apps.core.authentication.KeycloakJWTAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.NumaPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "apps.core.exceptions.problem_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.AnonRateThrottle", "rest_framework.throttling.UserRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"anon": "60/min", "user": "1200/min"},
}
SPECTACULAR_SETTINGS = {
    "TITLE": "API REST NUMA",
    "DESCRIPTION": "Gestion sécurisée et configurable des correspondances NUMA.",
    "VERSION": NUMA_VERSION,
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
}

USE_S3 = env_bool("USE_S3", bool(os.getenv("AWS_S3_ENDPOINT_URL")))
if USE_S3:
    AWS_ACCESS_KEY_ID = os.getenv("MINIO_ROOT_USER", "numa")
    AWS_SECRET_ACCESS_KEY = os.getenv("MINIO_ROOT_PASSWORD", "numa_dev_password")
    AWS_STORAGE_BUCKET_NAME = os.getenv("MINIO_BUCKET", "numa-documents")
    AWS_S3_ENDPOINT_URL = os.getenv("AWS_S3_ENDPOINT_URL", "http://minio:9000")
    AWS_S3_REGION_NAME = os.getenv("AWS_S3_REGION_NAME", "us-east-1")
    AWS_S3_ADDRESSING_STYLE = "path"
    AWS_DEFAULT_ACL = None
    AWS_QUERYSTRING_AUTH = True
    AWS_S3_FILE_OVERWRITE = False
    STORAGES = {
        "default": {"BACKEND": "storages.backends.s3.S3Storage"},
        "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
    }
else:
    STORAGES = {
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
    }

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/1")
CELERY_TASK_ALWAYS_EAGER = env_bool("CELERY_TASK_ALWAYS_EAGER", False)
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = int(os.getenv("CELERY_TASK_TIME_LIMIT", "3600"))
CELERY_BEAT_SCHEDULE = {
    "notification-emails": {
        "task": "apps.core.tasks.send_requested_notification_emails",
        "schedule": 60.0,
    },
}

CLAMAV_HOST = os.getenv("CLAMAV_HOST", "clamav")
CLAMAV_PORT = int(os.getenv("CLAMAV_PORT", "3310"))
MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE", str(25 * 1024 * 1024)))
DATA_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_SIZE + 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 2 * 1024 * 1024
ALLOWED_UPLOAD_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
}
OCR_LANGUAGES = os.getenv("OCR_LANGUAGES", "fra+eng")
OCR_MAX_PAGES = int(os.getenv("OCR_MAX_PAGES", "100"))
OCR_PAGE_TIMEOUT = int(os.getenv("OCR_PAGE_TIMEOUT", "30"))
OCR_DPI = int(os.getenv("OCR_DPI", "200"))
OCR_MIN_NATIVE_CHARACTERS = int(os.getenv("OCR_MIN_NATIVE_CHARACTERS", "40"))
MAX_EXTRACTED_TEXT_LENGTH = int(os.getenv("MAX_EXTRACTED_TEXT_LENGTH", "5000000"))
IMPORT_MAX_ERRORS = int(os.getenv("IMPORT_MAX_ERRORS", "1000"))
WEBHOOK_TIMEOUT_SECONDS = int(os.getenv("WEBHOOK_TIMEOUT_SECONDS", "15"))
BACKUP_TIMEOUT_SECONDS = int(os.getenv("BACKUP_TIMEOUT_SECONDS", "21600"))

EMAIL_BACKEND = os.getenv("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = os.getenv("EMAIL_HOST", "localhost")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "25"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", False)
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "NUMA <numa@localhost>")

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True
SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", not DEBUG)
SESSION_COOKIE_SECURE = env_bool("DJANGO_SESSION_COOKIE_SECURE", not DEBUG)
CSRF_COOKIE_SECURE = env_bool("DJANGO_CSRF_COOKIE_SECURE", not DEBUG)
SECURE_HSTS_SECONDS = int(os.getenv("DJANGO_SECURE_HSTS_SECONDS", "0" if DEBUG else "31536000"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG
SECURE_HSTS_PRELOAD = not DEBUG
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_REFERRER_POLICY = "same-origin"

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"json": {"()": "apps.core.logging.JsonFormatter"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "json"}},
    "root": {"handlers": ["console"], "level": os.getenv("LOG_LEVEL", "INFO")},
}
