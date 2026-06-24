# iMentor App (Offline-First AI Assistant) 🎓🤖

An offline-first, private educational assistant built using **React Native / Expo** and powered by **ExecuTorch** (PyTorch's on-device inference runtime) for fully private, on-device multimodal AI capability.

---

## 🌟 Key Features

### 1. Document RAG (Retrieval-Augmented Generation)
* **On-Device PDF Parsing**: Extracts text, headers, lists, and tables locally from imported PDFs.
* **On-Device VLM (Vision-Language Model)**: Extracted diagrams, figures, and charts are processed locally using **LiquidAI LFM-2.5-VL 450M** (~350MB quantized) to compile descriptive markdown captions of visual data.
* **Early Captioning Skip**: Visual "Skip Remaining Images & Compile" feature allows early cancellation of the image captioning process, immediately assembling the final document with whatever text and image descriptions were generated.
* **Local Context Pruning**: Implements a client-side keyword relevance scorer (`getRelevantContext`) that dynamically selects matching paragraphs for the user's query. This prevents context length overflow in the local model, ensuring stable generation without crashing.

### 2. Dual LLM Model Switcher
* Segmented control in the RAG header to toggle between:
  * 🌐 **Online Mode**: High-performance streaming via the Groq API (`llama-3.1-8b-instant`).
  * 📴 **Offline Mode**: Fully local inference running **Llama 3.2 1B** via ExecuTorch.

### 3. Voice & Speech-to-Text
* Integrated **Whisper (Tiny.en)** module via ExecuTorch for offline speech dictation.
* Allows voice queries in both RAG and standard chat screens.

### 4. Background Sync & Offline Queue
* Local conversation queuing: automatically buffers messages when offline.
* Automatic background synchronization to a MongoDB backend once network connectivity is restored.

---

## 🏗️ Technical Stack & Libraries

* **Framework**: [Expo](https://expo.dev/) (v54.0.0)
* **Inference Engine**: [react-native-executorch](https://github.com/software-mansion/react-native-executorch)
* **Models**:
  * LLM: Llama 3.2 1B (SpinQuant quantized)
  * VLM: LiquidAI LFM-2.5-VL 450M
  * Speech: Whisper Tiny.en
* **Styling**: TailwindCSS via NativeWind
* **State Management**: Zustand
* **Database / Backend**: Node.js API with Express & MongoDB

---

## 📂 Directory Structure

```
├── api/                     # Node.js backend API
│   ├── routes/              # Express routes (Multer PDF parser, etc.)
│   └── server.js            # Express server configuration
└── src/                     # Expo Native Application
    ├── app/                 # Expo Router file-based pages
    ├── components/          # Reusable UI components
    ├── hooks/               # Custom hooks (useOfflineChat, useWhisper, etc.)
    ├── screens/             # Main screen layouts (RagScreen, ChatScreen)
    ├── services/            # APIs, downloader services, & helper scripts
    └── store/               # Zustand global state (rag.store, chat.store)
```

---

## 🚀 Setup & Installation

### 1. Install Project Dependencies
Run this in the root directory:
```bash
npm install
```

Install the Expo Document Picker dependency on your host environment:
```bash
npx expo install expo-document-picker
```

### 2. Configure Environment Variables
Create a `.env` file in the `native-app` root directory:
```env
EXPO_PUBLIC_API_URL=http://<your-local-ip>:5000
```

### 3. Start the Backend API
Navigate to the `api` directory:
```bash
cd api
npm install
npm start
```

### 4. Run the Mobile App
Navigate to the `native-app` directory and start the Expo bundler:
```bash
npm run dev
```

---

## ⚙️ How to Test Offline RAG
1. **Download Local Models**: Open the app, navigate to **Settings**, and download the Whisper, Llama, and VLM model assets.
2. **Import PDF**: Go to the **Doc RAG** tab, select a PDF textbook containing diagrams or figures.
3. **On-Device Captioning**: The local VLM will begin analyzing extracted pages. Tap the "Skip" button if you want to skip remaining figures and instantly chat.
4. **Offline Switcher**: Click the top-left switcher pill to toggle **Offline** mode, and converse with the document fully local and private.
