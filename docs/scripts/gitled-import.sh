#!/usr/bin/env bash
# gitled-import.sh
# Sends git pull output to the GitLed API as a new commit record.
#
# Usage:
#   ./gitled-import.sh [pull_log] [project_id] [api_url]
#
# Defaults:
#   pull_log   = git_pull.log
#   project_id = 1
#   api_url    = http://localhost:3001/api/commits
#
# Find your project_id: curl -s http://localhost:3001/api/projects

PULL_LOG="${1:-git_pull.log}"
PROJECT_ID="${2:-1}"
API_URL="${3:-http://localhost:3001/api/commits}"

if [ ! -f "$PULL_LOG" ]; then
    echo "GitLed: $PULL_LOG not found, skipping"
    exit 0
fi

HEADER="=== $(date '+%a %m/%d/%Y %H:%M:%S') ============================"
RAW_TEXT="${HEADER}"$'\n'"$(cat "$PULL_LOG")"

# Use python3 for safe JSON encoding (handles special chars, backslashes, etc.)
BODY=$(python3 -c "
import json, sys
raw = sys.stdin.read()
print(json.dumps({'project_id': $PROJECT_ID, 'raw_text': raw}))
" <<< "$RAW_TEXT")

RESULT=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -d "$BODY")

if [ "$RESULT" = "201" ]; then
    echo "GitLed: imported OK"
else
    echo "GitLed: import skipped (server not running or error $RESULT)"
fi
