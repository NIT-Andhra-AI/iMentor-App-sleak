#!/usr/bin/env python3
"""
gen-config.py — Reads workspace.toml and generates all derived config files.

Outputs (all gitignored — do not edit directly):
  src-tauri/build_config.toml   ← compile-time deployment knobs for Rust
  src-tauri/models.toml         ← model URLs / filenames for build.rs
  src-tauri/tauri.conf.json     ← net installer config (app + BGE + courses)

Distribution:
  Online  — share StudentAI-net-setup-x86_64.exe alone (LLM downloads on first launch)
  Offline — share StudentAI-net-setup-x86_64.exe + llm.gguf in the same folder;
            NSIS hook copies llm.gguf automatically during installation.
  Both files are staged to dist/windows/ by scripts/build-all-windows.ps1.

Usage:
  python3 scripts/gen-config.py              # uses workspace.toml at repo root
  python3 scripts/gen-config.py --prod       # sets courses_in_bundle=false

Run this before any build. It is called automatically by:
  - cargo tauri dev    (via beforeDevCommand)
  - cargo tauri build  (via beforeBuildCommand)
  - scripts/build-all-linux.sh
  - scripts/build-all-windows.ps1
"""

import json
import os
import pathlib
import sys
import argparse

# ── tomllib compat (stdlib >= 3.11; fallback: pip install tomli) ─────────────
try:
    import tomllib
except ImportError:
    try:
        import tomli as tomllib  # type: ignore[no-redef]
    except ImportError:
        print(
            "ERROR: Python 3.11+ required, or install the 'tomli' package:\n"
            "  pip install tomli",
            file=sys.stderr,
        )
        sys.exit(1)

# ── Paths ────────────────────────────────────────────────────────────────────
SCRIPT_DIR  = pathlib.Path(__file__).parent
REPO_ROOT   = SCRIPT_DIR.parent
WORKSPACE   = REPO_ROOT / "workspace.toml"
TAURI_DIR   = REPO_ROOT / "src-tauri"

GENERATED_NOTICE = (
    "# !! GENERATED FILE — DO NOT EDIT DIRECTLY !!\n"
    "# Edit workspace.toml at the repo root, then run:\n"
    "#   python3 scripts/gen-config.py\n"
    "#\n"
)


# ── Helpers ──────────────────────────────────────────────────────────────────

def load_workspace() -> dict:
    if not WORKSPACE.exists():
        print(f"ERROR: workspace.toml not found at {WORKSPACE}", file=sys.stderr)
        sys.exit(1)
    try:
        with open(WORKSPACE, "rb") as f:
            return tomllib.load(f)
    except Exception as e:
        print(f"ERROR: Failed to parse workspace.toml: {e}", file=sys.stderr)
        sys.exit(1)


def write(path: pathlib.Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    print(f"  wrote {path.relative_to(REPO_ROOT)}")


def toml_str(v) -> str:
    """Render a Python value as a TOML string literal."""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, str):
        return f'"{v}"'
    return str(v)


def resource_path(path: pathlib.Path) -> str:
    """Render a path relative to src-tauri for tauri.conf.json resources."""
    return pathlib.Path("..").joinpath(path.relative_to(REPO_ROOT)).as_posix()


def resolve_bundled_model_path(source_file: str) -> pathlib.Path:
    """Prefer bundled_model/, then fall back to models/ for local dev builds."""
    candidates = [
        REPO_ROOT / "bundled_model" / source_file,
        REPO_ROOT / "models" / source_file,
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


# ── Generator: build_config.toml ─────────────────────────────────────────────

def gen_build_config(cfg: dict, prod: bool) -> None:
    inf = cfg.get("inference", {})
    dep = cfg.get("deployment", {})

    content = GENERATED_NOTICE + """
# ── LLM / RAG inference knobs ──────────────────────────────────────────────
# n_ctx is the CEILING; runtime reduces it when RAM is low.
# See src-tauri/src/runtime_tuning.rs → adaptive_n_ctx_from_ram()
n_ctx                 = {n_ctx}
chunk_size            = {chunk_size}
rag_top_k             = {rag_top_k}
quant_format          = {quant_format}
max_inference_threads = {max_inference_threads}

# ── Deployment ──────────────────────────────────────────────────────────────
server_url             = {server_url}
server_url_lan         = {server_url_lan}
expiry_date            = {expiry_date}
self_delete_on_expiry  = {self_delete_on_expiry}
self_delete_grace_days = {self_delete_grace_days}
expiry_warning_message = {expiry_warning_message}
max_install_days       = {max_install_days}
inactivity_days        = {inactivity_days}
""".format(
        n_ctx                  = inf.get("n_ctx", 4096),
        chunk_size             = inf.get("chunk_size", 1600),
        rag_top_k              = inf.get("rag_top_k", 2),
        quant_format           = toml_str(inf.get("quant_format", "q4_k_m")),
        max_inference_threads  = inf.get("max_inference_threads", 4),
        server_url             = toml_str(dep.get("server_url", "https://your-server-ip-or-domain")),
        server_url_lan         = toml_str(dep.get("server_url_lan", "")),
        expiry_date            = toml_str(dep.get("expiry_date", "")),
        self_delete_on_expiry  = toml_str(dep.get("self_delete_on_expiry", False)),
        self_delete_grace_days = dep.get("self_delete_grace_days", 7),
        expiry_warning_message = toml_str(dep.get("expiry_warning_message",
                                           "This version of Student AI has expired. Your access will end soon.")),
        max_install_days       = dep.get("max_install_days", 180),
        inactivity_days        = dep.get("inactivity_days", 30),
    )

    write(TAURI_DIR / "build_config.toml", content)


# ── Generator: models.toml ───────────────────────────────────────────────────

def _catalogue_entry(entry: dict, kind: str) -> str:
    """Render one [[catalogue.{kind}]] entry."""
    lines = [f"[[catalogue.{kind}]]"]
    for key in ("id", "label", "source_file", "file_name", "url", "size_mb", "notes"):
        if key in entry:
            v = entry[key]
            lines.append(f"{key:<12}= {toml_str(v)}")
    return "\n".join(lines)


def gen_models_toml(cfg: dict) -> None:
    models = cfg.get("models", {})
    llm    = models.get("llm", {})
    emb    = models.get("embedding", {})
    cat    = models.get("catalogue", {})

    lines = [
        GENERATED_NOTICE.rstrip("\n"),
        "",
        "# ┌─ Slot numbering ──────────────────────────────────────────────────┐",
        "# │ file_name slots are PERMANENT — never renumber existing entries.  │",
        "# │   chat-model-1.gguf  → Phi-4-mini-instruct Q4_K_M               │",
        "# │   chat-model-2.gguf  → Gemma 4 E4B-IT Q4_K_M                    │",
        "# │   chat-model-3.gguf  → Qwen2.5-4B-Instruct Q4_K_M               │",
        "# │   chat-model-4.gguf  → Gemma 4 E2B-IT Q4_K_M                    │",
        "# │   chat-model-5.gguf  → Qwen3-4B-Instruct Q4_K_M  (DEFAULT)      │",
        "# │   rag-model-1.gguf   → BGE-small-en-v1.5 Q8_0                   │",
        "# │   rag-model-2.gguf   → BGE-base-en-v1.5 Q8_0                    │",
        "# └───────────────────────────────────────────────────────────────────┘",
        "",
        "# ── Active LLM ──────────────────────────────────────────────────────",
        "[llm]",
    ]
    for k in ("display_name", "source_file", "file_name", "url", "size_mb", "no_think"):
        if k in llm:
            lines.append(f"{k:<13}= {toml_str(llm[k])}")

    lines += [
        "",
        "# ── Active Embedding Model ──────────────────────────────────────────",
        "[embedding]",
    ]
    for k in ("display_name", "source_file", "file_name", "url", "size_mb"):
        if k in emb:
            lines.append(f"{k:<13}= {toml_str(emb[k])}")

    if cat.get("llm"):
        lines += ["", "# ── LLM Catalogue ──────────────────────────────────────────────────", ""]
        for entry in cat["llm"]:
            lines.append(_catalogue_entry(entry, "llm"))
            lines.append("")

    if cat.get("embedding"):
        lines += ["# ── Embedding Catalogue ────────────────────────────────────────────", ""]
        for entry in cat["embedding"]:
            lines.append(_catalogue_entry(entry, "embedding"))
            lines.append("")

    write(TAURI_DIR / "models.toml", "\n".join(lines))


# ── Generator: nsis-model-hooks.nsh ─────────────────────────────────────────

def gen_nsis_hooks(cfg: dict) -> None:
    """Generate the NSIS installer hook with the correct active LLM slot filename."""
    models     = cfg.get("models", {})
    llm        = models.get("llm", {})
    llm_file   = llm.get("file_name", "chat-model-1.gguf")
    app_id     = cfg.get("app", {}).get("identifier", "com.studentai.app")
    appdata_models = f"$APPDATA\\{app_id}\\models"

    content = (
        "; Student AI NSIS installer hooks\n"
        "; !! GENERATED FILE — Edit workspace.toml then run gen-config.py !!\n"
        "; Included by Tauri via bundle.windows.nsis.installerHooks.\n"
        ";\n"
        "; Copies llm.gguf from the installer's directory into the user's AppData models\n"
        "; folder during installation. This enables a distributable package of:\n"
        ";   Student AI_x.y.z_x64-setup.exe   (app + BGE embedding model, ~43 MB)\n"
        ";   llm.gguf                           (LLM — rename to switch models)\n"
        ";\n"
        f"; The app reads models from: %APPDATA%\\{app_id}\\models\\\n"
        f";   {llm_file}  <- LLM (copied here by this hook, if present)\n"
        ";\n"
        "; NOTE: Tauri 2 invokes hooks via NSIS_HOOK_POSTINSTALL / NSIS_HOOK_POSTUNINSTALL\n"
        ";       (NOT the legacy customInstall / customUninstall names from Tauri 1).\n"
        "\n"
        "!macro NSIS_HOOK_POSTINSTALL\n"
        f"  ; Ensure the models directory exists.\n"
        f"  CreateDirectory \"{appdata_models}\"\n"
        "\n"
        "  ; --- Copy LLM sidecar if placed alongside setup.exe ---\n"
        "  ; For the net installer the user places llm.gguf next to setup.exe for\n"
        "  ; an offline-capable distribution. Web download is used only when absent.\n"
        "  ${If} ${FileExists} \"$EXEDIR\\llm.gguf\"\n"
        "    DetailPrint \"Installing AI language model (this may take a moment)...\"\n"
        f"    CopyFiles /SILENT \"$EXEDIR\\llm.gguf\" \"{appdata_models}\\{llm_file}\"\n"
        "    DetailPrint \"AI language model installed.\"\n"
        "  ${Else}\n"
        "    DetailPrint \"AI language model will be downloaded on first launch.\"\n"
        "  ${EndIf}\n"
        "!macroend\n"
        "\n"
        "!macro NSIS_HOOK_POSTUNINSTALL\n"
        "  ; Models are left in place by default so reinstalling is instant.\n"
        "  ; To wipe models on uninstall, uncomment:\n"
        f"  ; RMDir /r \"{appdata_models}\"\n"
        "!macroend\n"
    )

    nsh_path = TAURI_DIR / "wix" / "nsis-model-hooks.nsh"
    nsh_path.parent.mkdir(parents=True, exist_ok=True)
    write(nsh_path, content)


# ── Generator: tauri.conf.json ───────────────────────────────────────────────

def bundled_resources(cfg: dict) -> dict:
    models = cfg.get("models", {})
    llm = models.get("llm", {})
    emb = models.get("embedding", {})
    bun_cfg = cfg.get("bundle", {})
    skip_model_resources = os.environ.get("STUDENT_AI_SKIP_BUNDLED_MODELS", "").strip() == "1"
    # The net installer excludes the LLM: it is either copied from
    # llm.gguf placed alongside the setup.exe (NSIS hook) or downloaded
    # on first launch.
    llm_sidecar = True  # always: LLM excluded from installer resources

    resources: dict = {}

    if skip_model_resources:
        print("  NOTE: STUDENT_AI_SKIP_BUNDLED_MODELS=1 -> skipping model files in bundle resources")
    else:
        print("  NOTE: LLM excluded from net installer (place llm.gguf alongside setup.exe for offline install)")

    # Keep dev mode and packaged builds on the same asset layout.
    # Enumerate files individually so we can skip source PDFs (raw/*.pdf),
    # which are admin-only inputs for the course generation tool and are
    # not needed at runtime. Only .md, .json, .csv etc. are bundled.
    if bun_cfg.get("courses_in_bundle", True):
        courses_dir = REPO_ROOT / "assets" / "courses"
        if courses_dir.exists():
            pdf_count = 0
            for f in sorted(courses_dir.rglob("*")):
                if not f.is_file():
                    continue
                if f.suffix.lower() == ".pdf":
                    pdf_count += 1
                    continue  # skip source PDFs — not needed at runtime
                dst = "assets/courses/" + f.relative_to(courses_dir).as_posix()
                resources[resource_path(f)] = dst
            if pdf_count:
                print(f"  NOTE: skipped {pdf_count} source PDF(s) from courses bundle "
                      f"(raw/ source materials — not needed at runtime)")
        else:
            print("  WARNING: assets/courses not found — skipping from bundle")

    for model_cfg, kind in [(llm, "llm"), (emb, "embedding")]:
        if skip_model_resources:
            continue
        if llm_sidecar and kind == "llm":
            continue  # LLM distributed as llm.gguf alongside installer, not embedded
        source_file = model_cfg.get("source_file", "")
        if not source_file:
            continue
        model_path = resolve_bundled_model_path(source_file)
        if model_path.exists():
            resources[resource_path(model_path)] = "bundled_model/" + source_file
        else:
            print("  WARNING: " + kind + " model '" + source_file + "' not found in bundled_model/ or models/ — "
                  "skipping from bundle (place it there before building for distribution)")

    return resources


def gen_tauri_conf(cfg: dict, prod: bool) -> None:
    app_cfg = cfg.get("app", {})
    win_cfg = cfg.get("window", {})
    bun_cfg = cfg.get("bundle", {})

    conf = {
        "$schema": "https://schema.tauri.app/config/2",
        "productName": app_cfg.get("product_name", "Student AI"),
        "version": app_cfg.get("version", "0.1.0"),
        "identifier": app_cfg.get("identifier", "com.studentai.app"),
        "build": {
            "frontendDist": "../frontend/dist",
            "devUrl": "http://localhost:5173",
            "beforeDevCommand": "python3 ../scripts/generate_icons.py && python3 ../scripts/gen-config.py && cd ../frontend && bun run dev",
            "beforeBuildCommand": "python3 ../scripts/generate_icons.py && python3 ../scripts/gen-config.py && cd ../frontend && bun run build",
        },
        "app": {
            "windows": [
                {
                    "title": app_cfg.get("product_name", "Student AI"),
                    "width": win_cfg.get("width", 1280),
                    "height": win_cfg.get("height", 800),
                    "minWidth": win_cfg.get("min_width", 900),
                    "minHeight": win_cfg.get("min_height", 600),
                    "resizable": True,
                    "fullscreen": False,
                    "decorations": True,
                }
            ],
            "security": {"csp": None},
        },
        "bundle": {
            "active": True,
            "targets": bun_cfg.get("targets", ["nsis"]),
            "icon": bun_cfg.get("icon", ["icons/32x32.png", "icons/128x128.png", "icons/icon.ico"]),
            "licenseFile": bun_cfg.get("license_file", "../assets/license.txt"),
            "resources": bundled_resources(cfg),
            "windows": {
                "digestAlgorithm": "sha256",
                "timestampUrl": "",
                "webviewInstallMode": {"type": "downloadBootstrapper"},
                "nsis": {
                    "installerHooks": "wix/nsis-model-hooks.nsh",
                },
            },
        },
        "plugins": {
            "updater": {
                "pubkey": "",
                "endpoints": [],
            }
        },
    }

    # Pure JSON — no comment header (Tauri strict-JSON parser rejects // comments).
    write(TAURI_DIR / "tauri.conf.json", json.dumps(conf, indent=2) + "\n")


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate derived config files from workspace.toml."
    )
    parser.add_argument(
        "--prod",
        action="store_true",
        help="Deprecated compatibility flag. Bundled assets remain enabled.",
    )
    parser.add_argument(
        "--models",
        metavar="MODELS_TOML",
        help=(
            "Path to a models TOML file (e.g. src-tauri/models-gemma-e2b.toml). "
            "Overrides the [models.llm] and [models.embedding] sections from "
            "workspace.toml so that the correct model files are bundled into "
            "the installer for multi-model CI matrix builds."
        ),
    )
    args = parser.parse_args()

    print(f"gen-config.py: reading {WORKSPACE.relative_to(REPO_ROOT)}")
    cfg = load_workspace()

    if args.models:
        models_path = pathlib.Path(args.models)
        if not models_path.is_absolute():
            models_path = REPO_ROOT / models_path
        if not models_path.exists():
            print(f"ERROR: --models file not found: {models_path}", file=sys.stderr)
            sys.exit(1)
        with open(models_path, "rb") as f:
            override = tomllib.load(f)
        # Replace only the active llm/embedding entries; keep catalogue intact.
        cfg.setdefault("models", {})
        if "llm" in override:
            cfg["models"]["llm"] = override["llm"]
        if "embedding" in override:
            cfg["models"]["embedding"] = override["embedding"]
        print(f"gen-config.py: model override from {models_path.relative_to(REPO_ROOT)}")

    gen_build_config(cfg, prod=args.prod)
    gen_models_toml(cfg)
    gen_nsis_hooks(cfg)
    gen_tauri_conf(cfg, prod=args.prod)

    # Remove any stale override configs from old build strategies.
    for stale in [
        "tauri-withmodel.conf.json",
        "tauri-gpu-withmodel.conf.json",
        "tauri-gemma-e2b-withmodel.conf.json",
        "tauri-gemma-e4b-withmodel.conf.json",
        "tauri-qwen25-withmodel.conf.json",
    ]:
        stale_path = TAURI_DIR / stale
        if stale_path.exists():
            stale_path.unlink()
            print(f"  removed stale {stale}")

    bundle_note = "bundled assets enabled (courses + active models)"
    print(f"gen-config.py: done ({bundle_note})")


if __name__ == "__main__":
    main()
