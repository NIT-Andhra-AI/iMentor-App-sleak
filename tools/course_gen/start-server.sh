#!/usr/bin/env bash
# tools/course_gen/start-server.sh
# Start llama-cpp-python's OpenAI-compatible server for course generation (Ubuntu/Linux).
#
# Usage (from project root):
#   tools/course_gen/start-server.sh
#   tools/course_gen/start-server.sh qwen3.5-4b-q4_k_m.gguf
#   tools/course_gen/start-server.sh /full/path/to/model.gguf
#
# After starting, run:
#   python tools/course_gen/generate_wiki.py machine-learning
#
# Stop with:  Ctrl+C  or:  kill $(lsof -ti:8080)

set -e

# Allow override via environment variable
MODELS_DIR="${LLM_MODELS_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/com.studentai.app/models}"
DEFAULT_MODEL="${LLM_MODEL_FILE:-phi-4-mini-q4_k_m.gguf}"
PORT=8080
HOST="127.0.0.1"

# Resolve model path
if [[ $# -eq 0 ]]; then
    MODEL_PATH="$MODELS_DIR/$DEFAULT_MODEL"
elif [[ "$1" == /* ]]; then
    MODEL_PATH="$1"
else
    MODEL_PATH="$MODELS_DIR/$1"
fi

if [[ ! -f "$MODEL_PATH" ]]; then
    echo "ERROR: Model not found: $MODEL_PATH"
    echo "Available models in $MODELS_DIR:"
    ls "$MODELS_DIR"/*.gguf 2>/dev/null || echo "  (none)"
    exit 1
fi

# Activate admin venv if present (has llama-cpp-python installed)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VENV="$PROJECT_ROOT/admin-venv"

if [[ -d "$VENV" ]]; then
    source "$VENV/bin/activate"
    echo "Using venv: $VENV"
fi

# Check llama-cpp-python is available
if ! python -c "import llama_cpp" 2>/dev/null; then
    echo "llama-cpp-python not installed. Installing..."
    pip install "llama-cpp-python[server]" --upgrade
fi

MODEL_NAME=$(basename "$MODEL_PATH" .gguf)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Starting llama-cpp-python server"
echo "  Model: $MODEL_NAME"
echo "  Path:  $MODEL_PATH"
echo "  URL:   http://$HOST:$PORT/v1"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Once started, in another terminal run:"
echo "  python tools/course_gen/generate_wiki.py machine-learning"
echo ""

# n_ctx=4096 keeps RAM usage low; increase if you have more RAM
# n_threads=4 matches CPU profile for this machine
python -m llama_cpp.server \
    --model "$MODEL_PATH" \
    --host "$HOST" \
    --port "$PORT" \
    --n_ctx 4096 \
    --n_threads 4 \
    --chat_format chatml \
    --verbose 0
