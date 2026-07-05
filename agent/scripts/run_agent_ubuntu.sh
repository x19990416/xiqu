#!/usr/bin/env bash
set -euo pipefail

# Runtime helper for Ubuntu servers.
# Usage:
#   bash agent/scripts/run_agent_ubuntu.sh start|stop|restart|status|logs
#
# Required runtime:
#   - Node.js >= 20
#   - sage-wiki available in PATH, or set SAGE_WIKI_BIN=/path/to/sage-wiki
#   - .env placed in project root or wiki/xiqu-knowledge/.env

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${AGENT_ENV_FILE:-$ROOT_DIR/.env}"
PID_FILE="${AGENT_PID_FILE:-$ROOT_DIR/agent/tmp/agent.pid}"
LOG_FILE="${AGENT_LOG_FILE:-$ROOT_DIR/agent/logs/agent.log}"
NODE_BIN="${NODE_BIN:-node}"

mkdir -p "$(dirname "$PID_FILE")" "$(dirname "$LOG_FILE")"

load_env_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    return
  fi

  set -a
  # shellcheck disable=SC1090
  source "$file"
  set +a
}

load_env_file "$ENV_FILE"

AGENT_HOST="${AGENT_HOST:-127.0.0.1}"
AGENT_PORT="${AGENT_PORT:-8787}"
SAGE_WIKI_DIR="${SAGE_WIKI_DIR:-wiki/xiqu-knowledge}"
SAGE_WIKI_BIN="${SAGE_WIKI_BIN:-sage-wiki}"

is_running() {
  [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" >/dev/null 2>&1
}

check_runtime() {
  if ! command -v "$NODE_BIN" >/dev/null 2>&1; then
    echo "ERROR: Node.js not found. Install Node.js >= 20 or set NODE_BIN." >&2
    exit 1
  fi

  local node_major
  node_major="$("$NODE_BIN" -p "Number(process.versions.node.split('.')[0])")"
  if [[ "$node_major" -lt 20 ]]; then
    echo "ERROR: Node.js >= 20 is required, current: $("$NODE_BIN" -v)" >&2
    exit 1
  fi

  if ! command -v "$SAGE_WIKI_BIN" >/dev/null 2>&1; then
    echo "ERROR: sage-wiki not found. Install it or set SAGE_WIKI_BIN." >&2
    exit 1
  fi

  if [[ ! -d "$ROOT_DIR/$SAGE_WIKI_DIR" && ! -d "$SAGE_WIKI_DIR" ]]; then
    echo "ERROR: SAGE_WIKI_DIR not found: $SAGE_WIKI_DIR" >&2
    exit 1
  fi
}

start_agent() {
  if is_running; then
    echo "xiqu agent is already running: pid=$(cat "$PID_FILE")"
    return
  fi

  check_runtime

  echo "Starting xiqu agent on ${AGENT_HOST}:${AGENT_PORT} ..."
  nohup env \
    AGENT_HOST="$AGENT_HOST" \
    AGENT_PORT="$AGENT_PORT" \
    SAGE_WIKI_DIR="$SAGE_WIKI_DIR" \
    SAGE_WIKI_BIN="$SAGE_WIKI_BIN" \
    "$NODE_BIN" agent/api/server.mjs >>"$LOG_FILE" 2>&1 &

  echo "$!" >"$PID_FILE"
  sleep 1

  if ! is_running; then
    echo "ERROR: xiqu agent failed to start. Log:" >&2
    tail -80 "$LOG_FILE" >&2 || true
    exit 1
  fi

  echo "xiqu agent started: pid=$(cat "$PID_FILE")"
  echo "health: http://${AGENT_HOST}:${AGENT_PORT}/xiqu-agent-api/agent/health"
}

stop_agent() {
  if ! is_running; then
    echo "xiqu agent is not running."
    rm -f "$PID_FILE"
    return
  fi

  local pid
  pid="$(cat "$PID_FILE")"
  echo "Stopping xiqu agent: pid=$pid"
  kill "$pid"

  for _ in $(seq 1 20); do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      rm -f "$PID_FILE"
      echo "xiqu agent stopped."
      return
    fi
    sleep 0.2
  done

  echo "Process did not exit in time; sending SIGKILL."
  kill -9 "$pid" >/dev/null 2>&1 || true
  rm -f "$PID_FILE"
}

status_agent() {
  if is_running; then
    echo "xiqu agent is running: pid=$(cat "$PID_FILE")"
    echo "health: http://${AGENT_HOST}:${AGENT_PORT}/xiqu-agent-api/agent/health"
  else
    echo "xiqu agent is not running."
  fi
}

case "${1:-}" in
  start)
    start_agent
    ;;
  stop)
    stop_agent
    ;;
  restart)
    stop_agent
    start_agent
    ;;
  status)
    status_agent
    ;;
  logs)
    touch "$LOG_FILE"
    tail -f "$LOG_FILE"
    ;;
  *)
    echo "Usage: bash agent/scripts/run_agent_ubuntu.sh start|stop|restart|status|logs" >&2
    exit 2
    ;;
esac
