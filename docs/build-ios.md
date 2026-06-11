# iOS Build Guide — Student AI

**Status**: Planned & Approved for Unified GGUF Strategy  
**Inference**: llama.cpp with native Apple Metal GPU acceleration — **GGUF format in the `models/` directory**  
**Required Build Host**: macOS with Xcode (required for iOS compiling, signing, and provisioning)

---

## The Unified GGUF Strategy on iOS

To preserve identical response quality and support local reasoning parameters without conversion drift, iOS uses **`llama.cpp`** compiled with native **Apple Metal** support.

### Why llama.cpp with Metal?
* **Zero Quality Compromises:** Runs the **exact same GGUF models** (e.g. Qwen 3.5 Instruct Q4_K_M) downloaded to the standard `models/` folder.
* **Peak Hardware Acceleration:** Metal utilizes the unified memory architecture of Apple's Silicon and A-series chips. Matrix operations are offloaded to the GPU/Neural Engine with near-zero latency, yielding **20–35+ tokens/second** on modern iPhones and iPads.
* **Unified Downloader:** No custom format conversion is required. The app downloads standard GGUF files directly to the iOS sandbox Library directory:
  `Library/Application Support/com.studentai.app/models/` (resolved automatically via Tauri's secure `app_data_dir()`).

---

## Prerequisites (macOS Build Host)

### 1. Xcode & Command Line Tools
Download Xcode from the Mac App Store and run the following in terminal to install CLI tools:
```bash
xcode-select --install
```

### 2. Rust iOS Targets
```bash
rustup target add \
  aarch64-apple-ios \
  x86_64-apple-ios \
  aarch64-apple-ios-sim
```

### 3. Homebrew & CocoaPods
Install CocoaPods for iOS dependency management:
```bash
brew install cocoapods
```

### 4. Apple Developer Account
Ensure you have a free or paid Apple Developer account to configure code signing in Xcode.

---

## Project Setup

To initialize the iOS project folder and generate Xcode build assets:
```bash
cargo tauri ios init --ci
```
This generates the Xcode workspace at `src-tauri/gen/apple/`.

---

## Model Management & Storage

Model files are placed in the application's secure iOS Library sandbox:
* **Storage Location:** `Library/Application Support/com.studentai.app/models/`
* **Download Flow:** Managed automatically by the Svelte downloader on first run, fetching the configured GGUF from `models.toml` and storing it as `chat-model-6.gguf`.

---

## Building and Running

### Development & Testing
To compile and launch the app in the iOS Simulator or on a connected physical iPhone/iPad:
```bash
# Running on iOS Simulator (aarch64-apple-ios-sim)
cargo tauri ios dev

# Running on connected physical iOS device
cargo tauri ios dev --device <DEVICE_ID>
```

### Apple Metal Compilation
During target compilation, the build script `build.rs` compiles the C++ `llama.cpp` sources with the `-DLLAMA_METAL=ON` flag. The iOS build automatically compiles and packages the `.metal` shader sources into a `default.metallib` embedded in the final application bundle.

---

## Code Signing & Provisioning (Required for Devices)

Before you can run the app on a physical iPhone or upload to TestFlight:
1. Open the generated project in Xcode:
   ```bash
   cargo tauri ios open
   ```
2. In Xcode, select the **Student AI** project root in the left sidebar.
3. Select the **Signing & Capabilities** tab.
4. Check **Automatically manage signing** and select your Apple Developer Team.
5. Under **Bundle Identifier**, ensure it matches your configured `identifier` in `workspace.toml` (e.g. `com.studentai.app`).
6. Trust your developer certificate on your physical iOS device (`Settings > General > VPN & Device Management`).
