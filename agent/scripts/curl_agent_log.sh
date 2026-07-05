#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

AGENT_API_URL="${AGENT_API_URL:-https://lab.colourfuldawn.com/xiqu-agent-api/agent/ask}"
SESSION_ID="${SESSION_ID:-demo-user-1}"
QUESTION="${QUESTION:-那它有哪些代表作？}"
OUT_DIR="${OUT_DIR:-agent/logs/curl}"
STAMP="$(date +%Y%m%d%H%M%S)"
OUT_FILE="${OUT_FILE:-$OUT_DIR/agent-curl-${STAMP}.txt}"

mkdir -p "$OUT_DIR"

REQUEST_BODY="$(cat <<JSON
{
  "sessionId": "$SESSION_ID",
  "question": "$QUESTION",
  "history": [
    {
      "role": "user",
      "content": "昆曲是什么？"
    },
    {
      "role": "assistant",
      "content": "昆曲是中国古老的戏曲声腔、剧种之一……"
    }
  ]
}
JSON
)"

{
  printf '=== xiqu agent curl log ===\n'
  printf 'time: %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')"
  printf 'url: %s\n\n' "$AGENT_API_URL"

  printf '=== request ===\n'
  printf 'curl -X POST %q -H %q -d %q\n\n' "$AGENT_API_URL" 'Content-Type: application/json' "$REQUEST_BODY"
  printf '%s\n\n' "$REQUEST_BODY"

  printf '=== response ===\n'
} >"$OUT_FILE"

curl -sS -i -X POST "$AGENT_API_URL" \
  -H 'Content-Type: application/json' \
  -d "$REQUEST_BODY" \
  -w '\nHTTP_STATUS=%{http_code}\n' \
  >>"$OUT_FILE"

{
  printf '\n=== curl meta ===\n'
  printf 'output_file: %s\n' "$OUT_FILE"
} >>"$OUT_FILE"

printf 'Wrote curl request/response log: %s\n' "$OUT_FILE"
