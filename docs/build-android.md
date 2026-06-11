# Android APK Build Guide — Student AI

**Status**: Planned & Approved for Unified GGUF Strategy  
**Inference**: llama.cpp with Vulkan/Neon GPU acceleration — **GGUF format in the `models/` directory**  
**Recommended build OS**: Ubuntu 24.04 (due to Android NDK and Vulkan SDK compilation tools)

---

## The Unified GGUF Strategy on Android

To maintain 100% model quality without compromise and keep a single, unified downloader, Android uses **`llama.cpp`** compiled with native Vulkan and Neon CPU vectorization support. 

### Why llama.cpp with Vulkan/Neon?
* **Zero Quality Compromises:** Runs the **exact same GGUF models** (e.g. Qwen 3.5 Instruct Q4_K_M) downloaded to the standard `models/` folder.
* **Unified Downloader:** No custom format conversion to LiteRT `.task` or `.tflite` is required. The app downloads standard GGUF files to:
  `/data/user/0/com.studentai.app/files/models/` (mapped via Tauri's secure `app_data_dir()`).
* **GPU/CPU Hardware Acceleration:** Compiling `llama.cpp` with Vulkan offloads matrix math to the mobile GPU (Adreno/Mali), yielding **15–20+ tokens/second** on modern Android devices. On older devices, ARM Neon instructions provide optimized CPU inference.

---

## Prerequisites (Ubuntu Build Host)

### 1. All desktop prerequisites
Follow the setup in `docs/setup-ubuntu.md` first (Rust, Clang, Node, Tauri CLI).

### 2. Java 17 & Android SDK/NDK
```bash
sudo apt-get install -y openjdk-17-jdk
# Download Android Studio from https://developer.android.com/studio
sudo snap install android-studio --classic
```

Launch Android Studio, complete the SDK setup wizard, and install:
* Android SDK (API 34 or newer)
* Android NDK (latest LTS)
* Android SDK Build-Tools

### 3. Vulkan SDK (For GPU Acceleration)
Install Vulkan headers and libraries for cross-compiling the GPU backend:
```bash
sudo apt-get install -y vulkan-tools libvulkan-dev
```

### 4. Environment Variables
Add the following to your `~/.bashrc`:
```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/$(ls $ANDROID_HOME/ndk | sort -V | tail -1)"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"
```
Run `source ~/.bashrc` to reload.

### 5. Android Rust Targets
```bash
rustup target add \
  aarch64-linux-android \
  armv7-linux-androideabi \
  x86_64-linux-android \
  i686-linux-android
```

---

## Project Setup

To initialize the mobile target folder with the Tauri Mobile configuration:
```bash
cargo tauri android init --ci
```
This initializes `src-tauri/gen/android/` containing the Gradle project structure.

---

## Model Management & Storage

Model files are placed in the application's secure target storage:
* **Storage Location:** `/data/user/0/com.studentai.app/files/models/`
* **Download Flow:** Managed automatically by the Svelte downloader on first run, fetching the configured GGUF from `models.toml` and storing it as `chat-model-6.gguf`.

---

## Building the APK

### Compilation Flags
Tauri automatically compiles your Rust crates (including `crates/inference` wrapper around `llama-cpp-2`) as a JNI dynamic library linked into the APK. 

To enable Vulkan GPU acceleration during the build, make sure `vulkan` build flags are passed:
```bash
# Debug APK (for USB device testing)
cargo tauri android dev

# Release APK
cargo tauri android build
```

The output will be generated at:
`src-tauri/gen/android/app/build/outputs/apk/release/app-release.apk`

---

## Distribution Checklist
- [ ] Rust target targets installed and checked
- [ ] GGUF models directory mapped securely using Tauri's `app_data_dir()`
- [ ] APK compiled with Vulkan support and verified on physical Android hardware
- [ ] Keystore signature applied (`studentai.keystore`)
