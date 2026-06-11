"""
Configuration for Student AI course generation.

Works on both Ubuntu and Windows.

Start the LLM server:
  Ubuntu:   tools/course_gen/start-server.sh
  Windows:  tools\\course_gen\\start-server.ps1

Then generate a course wiki:
  python tools/course_gen/generate_wiki.py machine-learning
"""
import os
import sys

# ── LLM server (llama-cpp-python) ─────────────────────────────────────
LLM_ENABLED = True

# llama-cpp-python server default port is 8080
LLM_URL   = os.getenv("LLM_URL",   "http://127.0.0.1:8080/v1")
LLM_MODEL = os.getenv("LLM_MODEL", "phi-4-mini")   # arbitrary name, server ignores it

# ── Generation parameters ──────────────────────────────────────────────
SCHEMA_PARAMS = {       # structured JSON — low temperature for precision
    "temperature": 0.1,
    "max_tokens":  3000,
}
NOTE_PARAMS = {         # rich prose generation
    "temperature": 0.3,
    "max_tokens":  3000,
}

# ── Paths ──────────────────────────────────────────────────────────────
REPO_ROOT   = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
COURSES_DIR = os.path.join(REPO_ROOT, "assets", "courses")

# Platform-aware models directory — mirrors what the Tauri app uses at runtime.
#   Windows : %LOCALAPPDATA%\StudentAI\models
#   Linux   : $XDG_DATA_HOME/com.studentai.app/models  (default ~/.local/share/…)
# Override either with the LLM_MODELS_DIR environment variable.
if "LLM_MODELS_DIR" in os.environ:
    MODELS_DIR = os.environ["LLM_MODELS_DIR"]
elif sys.platform == "win32":
    _local = os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
    MODELS_DIR = os.path.join(_local, "StudentAI", "models")
else:
    _data = os.environ.get("XDG_DATA_HOME", os.path.join(os.path.expanduser("~"), ".local", "share"))
    MODELS_DIR = os.path.join(_data, "com.studentai.app", "models")

# Default model for course generation (heavier model = better notes).
# Override with LLM_MODEL_FILE env var, e.g.:
#   LLM_MODEL_FILE=qwen3.5-4b-q4_k_m.gguf python tools/course_gen/generate_wiki.py …
DEFAULT_MODEL = os.path.join(
    MODELS_DIR,
    os.environ.get("LLM_MODEL_FILE", "phi-4-mini-q4_k_m.gguf"),
)
