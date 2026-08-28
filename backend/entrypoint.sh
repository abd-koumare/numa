#!/bin/sh
set -eu

if [ "${NUMA_RUN_MIGRATIONS:-true}" = "true" ]; then
    python manage.py migrate --noinput
fi

if [ "${NUMA_COLLECTSTATIC:-true}" = "true" ]; then
    python manage.py collectstatic --noinput
fi

if [ "${NUMA_SEED_DEMO:-false}" = "true" ]; then
    python manage.py seed_demo
fi

if [ "${NUMA_USE_RUNSERVER:-false}" = "true" ]; then
    exec python manage.py runserver 0.0.0.0:8000
fi

exec gunicorn numa.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers "${GUNICORN_WORKERS:-4}" \
    --threads "${GUNICORN_THREADS:-2}" \
    --timeout "${GUNICORN_TIMEOUT:-120}" \
    --access-logfile - \
    --error-logfile -
