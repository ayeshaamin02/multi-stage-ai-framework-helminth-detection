#!/bin/sh
set -e

python /app/prefetch_models.py

exec "$@"
