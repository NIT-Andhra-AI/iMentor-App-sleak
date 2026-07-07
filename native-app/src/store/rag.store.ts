import { createStore } from './store';

export type PdfProcessStep = 'idle' | 'uploading' | 'extracting_images' | 'captioning' | 'compiling';

export interface RagMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface RagDocumentItem {
  _id: string;
  fileName: string;
  fileId: string;
  createdAt: string;
}

interface RagState {
  // VLM Model State (Retained for Settings Tab compatibility)
  vlmModelReady: boolean;
  isVlmDownloading: boolean;
  vlmDownloadProgress: number;
  vlmSpeedMBps: string;
  vlmModelSize: number | null;
  vlmDownloadedAt: string | null;

  // Processing State
  pdfProcessing: boolean;
  pdfProcessStep: PdfProcessStep;
  captionTotalImages: number;
  captionCurrentIndex: number;
  cancelCaptioningRequested: boolean;

  selectedModel: 'online' | 'offline';

  // Document State
  markdownDoc: string | null;
  activeFileName: string | null;
  activeDocumentId: string | null; // MongoDB ID of the active document

  // History State
  documents: RagDocumentItem[];
  isHistoryLoading: boolean;

  // Conversation State
  ragMessages: RagMessage[];
  isThinking: boolean;
  isStreaming: boolean;
  streamingText: string;

  // Actions
  setVlmModelReady: (ready: boolean) => void;
  setVlmDownloading: (downloading: boolean) => void;
  setVlmDownloadProgress: (progress: number) => void;
  setVlmSpeedMBps: (speed: string) => void;
  setVlmMetadata: (metadata: { size: number; downloadedAt: string }) => void;
  resetVlmMetadata: () => void;

  setPdfProcessing: (processing: boolean) => void;
  setPdfProcessStep: (step: PdfProcessStep) => void;
  setCaptionProgress: (current: number, total: number) => void;
  requestCancelCaptioning: () => void;
  setSelectedModel: (model: 'online' | 'offline') => void;
  
  setMarkdownDoc: (doc: string | null, fileName: string | null) => void;
  setActiveDocumentId: (id: string | null) => void;
  
  // History Actions
  setDocuments: (docs: RagDocumentItem[]) => void;
  setHistoryLoading: (loading: boolean) => void;
  addDocument: (doc: RagDocumentItem) => void;
  removeDocument: (id: string) => void;

  setRagMessages: (messages: RagMessage[]) => void;
  addRagMessage: (message: RagMessage) => void;
  setThinking: (thinking: boolean) => void;
  setStreaming: (streaming: boolean) => void;
  setStreamingText: (text: string) => void;
  resetRagSession: () => void;
}

export const useRagStore = createStore<RagState>((set) => ({
  vlmModelReady: false,
  isVlmDownloading: false,
  vlmDownloadProgress: 0,
  vlmSpeedMBps: '0.0',
  vlmModelSize: null,
  vlmDownloadedAt: null,

  pdfProcessing: false,
  pdfProcessStep: 'idle',
  captionTotalImages: 0,
  captionCurrentIndex: 0,
  cancelCaptioningRequested: false,
  selectedModel: 'offline',

  markdownDoc: null,
  activeFileName: null,
  activeDocumentId: null,

  documents: [],
  isHistoryLoading: false,

  ragMessages: [],
  isThinking: false,
  isStreaming: false,
  streamingText: '',

  setVlmModelReady: (ready) => set({ vlmModelReady: ready }),
  setVlmDownloading: (downloading) => set({ isVlmDownloading: downloading }),
  setVlmDownloadProgress: (progress) => set({ vlmDownloadProgress: progress }),
  setVlmSpeedMBps: (speed) => set({ vlmSpeedMBps: speed }),
  setVlmMetadata: (metadata) => set({
    vlmModelReady: true,
    vlmModelSize: metadata.size,
    vlmDownloadedAt: metadata.downloadedAt
  }),
  resetVlmMetadata: () => set({
    vlmModelReady: false,
    vlmModelSize: null,
    vlmDownloadedAt: null,
    vlmDownloadProgress: 0,
    vlmSpeedMBps: '0.0'
  }),

  setPdfProcessing: (processing) => set({ pdfProcessing: processing }),
  setPdfProcessStep: (step) => set({ pdfProcessStep: step }),
  setCaptionProgress: (current, total) => set({ captionCurrentIndex: current, captionTotalImages: total }),
  requestCancelCaptioning: () => set({ cancelCaptioningRequested: true }),
  setSelectedModel: (model) => set({ selectedModel: model }),

  setMarkdownDoc: (doc, fileName) => set({ markdownDoc: doc, activeFileName: fileName }),
  setActiveDocumentId: (id) => set({ activeDocumentId: id }),

  setDocuments: (docs) => set({ documents: docs }),
  setHistoryLoading: (loading) => set({ isHistoryLoading: loading }),
  addDocument: (doc) => set((state) => ({ documents: [doc, ...state.documents] })),
  removeDocument: (id) => set((state) => ({ documents: state.documents.filter(d => d._id !== id) })),

  setRagMessages: (messages) => set({ ragMessages: messages }),
  addRagMessage: (message) => set((state) => ({ ragMessages: [...state.ragMessages, message] })),
  setThinking: (thinking) => set({ isThinking: thinking }),
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  setStreamingText: (text) => set({ streamingText: text }),
  resetRagSession: () => set({
    pdfProcessing: false,
    pdfProcessStep: 'idle',
    captionTotalImages: 0,
    captionCurrentIndex: 0,
    cancelCaptioningRequested: false,
    markdownDoc: null,
    activeFileName: null,
    activeDocumentId: null,
    ragMessages: [],
    isThinking: false,
    isStreaming: false,
    streamingText: ''
  })
}));
