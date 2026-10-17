#!/usr/bin/env bash
# ============================================================================
# WXOps 15-Day Persistent Observation Archive Backup Script (Bash / POSIX)
# Usage: ./backup_wxops.sh <BASE_URL>
# Example: ./backup_wxops.sh https://your-wxops.vercel.app
# ============================================================================

set -euo pipefail

BASE_URL="${1:-}"

if [ -z "$BASE_URL" ]; then
    read -rp "Enter WXOps Base URL (e.g. https://your-wxops.vercel.app): " BASE_URL
fi

# Strip trailing slash
BASE_URL="${BASE_URL%/}"

if [ -z "$BASE_URL" ]; then
    echo "[ERROR] No WXOps Base URL provided. Aborting." >&2
    exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
    echo "[ERROR] 'curl' command not found." >&2
    exit 1
fi

mkdir -p backups
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
OUTPUT_FILE="backups/wxops_archive_${TIMESTAMP}.json"
ENDPOINT="${BASE_URL}/api/observations/archive"

echo "[WXOps] Requesting 15-day observation archive from: ${ENDPOINT}"
curl -fsSL "${ENDPOINT}" -o "${OUTPUT_FILE}"

echo "[SUCCESS] 15-day observation archive backed up successfully."
echo "[SAVED] ${OUTPUT_FILE}"
