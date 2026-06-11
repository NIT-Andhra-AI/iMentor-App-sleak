; Student AI NSIS installer hooks
; !! GENERATED FILE — Edit workspace.toml then run gen-config.py !!
; Included by Tauri via bundle.windows.nsis.installerHooks.
;
; Copies llm.gguf from the installer's directory into the user's AppData models
; folder during installation. This enables a distributable package of:
;   Student AI_x.y.z_x64-setup.exe   (app + BGE embedding model, ~43 MB)
;   llm.gguf                           (LLM — rename to switch models)
;
; The app reads models from: %APPDATA%\com.studentai.app\models\
;   chat-model-5.gguf  <- LLM (copied here by this hook, if present)
;
; NOTE: Tauri 2 invokes hooks via NSIS_HOOK_POSTINSTALL / NSIS_HOOK_POSTUNINSTALL
;       (NOT the legacy customInstall / customUninstall names from Tauri 1).

!macro NSIS_HOOK_POSTINSTALL
  ; Ensure the models directory exists.
  CreateDirectory "$APPDATA\com.studentai.app\models"

  ; --- Copy LLM sidecar if placed alongside setup.exe ---
  ; For the net installer the user places llm.gguf next to setup.exe for
  ; an offline-capable distribution. Web download is used only when absent.
  ${If} ${FileExists} "$EXEDIR\llm.gguf"
    DetailPrint "Installing AI language model (this may take a moment)..."
    CopyFiles /SILENT "$EXEDIR\llm.gguf" "$APPDATA\com.studentai.app\models\chat-model-5.gguf"
    DetailPrint "AI language model installed."
  ${Else}
    DetailPrint "AI language model will be downloaded on first launch."
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Models are left in place by default so reinstalling is instant.
  ; To wipe models on uninstall, uncomment:
  ; RMDir /r "$APPDATA\com.studentai.app\models"
!macroend
