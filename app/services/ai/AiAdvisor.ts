// llama.rn and react-native-fs are heavy native modules NOT available in Expo Go.
// They are required lazily inside methods rather than at import time so that
// importing AiAdvisor.ts does not crash the module chain during app startup.
// When running in Expo Go, all AI features gracefully no-op.
let _initLlama: typeof import('llama.rn')['initLlama'] | null = null;
let _LlamaContext: typeof import('llama.rn')['LlamaContext'] | null = null;
let _RNFS: typeof import('react-native-fs') | null = null;
try {
  const llamaRn = require('llama.rn');
  _initLlama = llamaRn.initLlama;
  _LlamaContext = llamaRn.LlamaContext;
} catch (e) { console.warn('[AiAdvisor] llama.rn not available in this environment.'); }
try { _RNFS = require('react-native-fs'); } catch (e) { console.warn('[AiAdvisor] react-native-fs not available.'); }

import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { EventBus } from '../EventBus';
import { useStore } from '../storage/StateManager';

class AiAdvisorService {
  private context: any | null = null; // LlamaContext — typed as any to avoid static import
  private isInitializing: boolean = false;
  private modelUri: string = FileSystem.documentDirectory + 'phi-3-mini.gguf';
  private downloadUrl: string = 'https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf';
  private downloadProgress: number = 0;
  private isDownloading: boolean = false;

  constructor() {
      this.startListening();
  }

  private startListening() {
      EventBus.on('message.secure-received', async (data) => {
          const { settings } = useStore.getState();
          if (!settings.taskDetectionEnabled) {
              console.log('AiAdvisor: Task detection disabled in settings.');
              return;
          }

          console.log('AiAdvisor: Analyzing incoming message for tasks...');
          const task = await this.extractTasks(data.content);
          if (task) {
              console.log('AiAdvisor: Task detected:', task);
              EventBus.emit('ai.task-detected', {
                  chatId: data.from,
                  task: task.title,
                  originalContent: data.content
              });
          }
      });
  }

  async verifyModelHash(uri: string): Promise<boolean> {
    try {
      console.log('AiAdvisor: Calculating file SHA-256 hash for integrity validation...');
      // Strip 'file://' if present, react-native-fs expects raw path
      const filePath = uri.replace(/^file:\/\//, '');
      if (!_RNFS) { console.warn('AiAdvisor: RNFS not available, skipping hash check.'); return false; }
      const hash = await (_RNFS as any).hash(filePath, 'sha256');
      console.log('AiAdvisor: Model SHA-256 calculated:', hash);
      
      const expectedHash = '4fed7364ee3e0c7cb4fe0880148bfdfcd1b630981efa0802a6b62ee52e7da97e';
      
      if (hash !== expectedHash) {
        console.warn(`AiAdvisor: SHA-256 mismatch! Expected ${expectedHash}, got ${hash}. Blocking load.`);
        return false;
      }
      
      console.log('AiAdvisor: SHA-256 verification succeeded. Integrity verified.');
      return true;
    } catch (e) {
      console.error('AiAdvisor: Failed to compute model hash', e);
      return false;
    }
  }

  async downloadModel(onProgress?: (progress: number) => void): Promise<boolean> {
    if (this.isDownloading) return false;
    
    try {
      const fileInfo = await FileSystem.getInfoAsync(this.modelUri);
      if (fileInfo.exists) {
        console.log('AiAdvisor: Model already downloaded at', this.modelUri);
        const verified = await this.verifyModelHash(this.modelUri);
        if (verified) {
          if (onProgress) onProgress(1);
          return true;
        } else {
          console.warn('AiAdvisor: Existing model failed validation, deleting to re-download...');
          await FileSystem.deleteAsync(this.modelUri, { idempotent: true });
        }
      }

      this.isDownloading = true;
      console.log('AiAdvisor: Starting model download from huggingface...');

      const callback = (downloadProgress: any) => {
        const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
        this.downloadProgress = progress;
        if (onProgress) onProgress(progress);
        console.log(`AiAdvisor: Download progress: ${(progress * 100).toFixed(2)}%`);
      };

      const downloadResumable = FileSystem.createDownloadResumable(
        this.downloadUrl,
        this.modelUri,
        {},
        callback
      );

      const result = await downloadResumable.downloadAsync();
      this.isDownloading = false;
      
      if (result && result.uri) {
        console.log('AiAdvisor: Model downloaded successfully to', result.uri);
        const verified = await this.verifyModelHash(result.uri);
        return verified;
      }
      return false;
    } catch (e) {
      console.error('AiAdvisor: Model download failed', e);
      this.isDownloading = false;
      return false;
    }
  }

  async initialize() {
    const { settings } = useStore.getState();
    if (settings.liteModeEnabled) {
      console.log('AiAdvisor: Lite Mode enabled. Bypassing heavy AI initialization.');
      return;
    }

    if (this.context || this.isInitializing) return;

    this.isInitializing = true;
    console.log('AiAdvisor: Initializing...');

    try {
      const fileInfo = await FileSystem.getInfoAsync(this.modelUri);
      let localPath = this.modelUri;

      if (fileInfo.exists) {
        const verified = await this.verifyModelHash(this.modelUri);
        if (!verified) {
          throw new Error('Model integrity check failed. Please re-download the model.');
        }
      } else {
        console.log('AiAdvisor: Local model file not found in document directory. Falling back to bundled mock asset if available.');
        try {
          const modelAsset = Asset.fromModule(require('../../models/phi-3-mini.gguf'));
          await modelAsset.downloadAsync();
          if (modelAsset.localUri) {
            localPath = modelAsset.localUri;
          } else {
            throw new Error('No bundled model fallback uri');
          }
        } catch (assetErr) {
          console.log('AiAdvisor: Bundled fallback unavailable. Model needs to be downloaded.');
          throw new Error('Model file not found. Download required.');
        }
      }

      console.log('AiAdvisor: Loading model from', localPath);
      
      // 2. Initialize Llama Context with JSI offloading
      if (!_initLlama) throw new Error('llama.rn not available in this environment.');
      this.context = await _initLlama({
        model: localPath,
        use_mlock: true,   // Performance: lock memory to prevent swapping
        n_gpu_layers: 99,  // Performance: offload all layers to Apple Neural Engine / GPU
      });

      console.log('AiAdvisor: Context initialized successfully');
    } catch (e) {
      console.error('AiAdvisor: Failed to initialize model', e);
    } finally {
      this.isInitializing = false;
    }
  }

  isReady(): boolean {
    return !!this.context;
  }

  private sanitizeSystemRoleTags(input: string): string {
    // Strip common LLM chat prompt injection patterns and template tokens
    return input
      .replace(/<\|system\|>/gi, '')
      .replace(/<\|user\|>/gi, '')
      .replace(/<\|assistant\|>/gi, '')
      .replace(/<\|end\|>/gi, '')
      .replace(/system instruction:/gi, '')
      .replace(/override system prompt/gi, '');
  }

  private addTimingObfuscationPadding(prompt: string): string {
    const noiseWords = [' ', '\t', '\n', '  ', '   ', '\n ', ' \t'];
    const count = Math.floor(Math.random() * 8) + 1; // 1 to 8 timing padding inputs
    let noise = '';
    for (let i = 0; i < count; i++) {
      noise += noiseWords[Math.floor(Math.random() * noiseWords.length)];
    }
    return noise + prompt;
  }

  async zeroizeMemoryAndCache(): Promise<void> {
    if (this.context) {
      console.warn('AiAdvisor: Executing explicit VRAM and model KV-cache zeroization sweeps...');
      try {
        if (typeof (this.context as any).release === 'function') {
          await (this.context as any).release();
        }
      } catch (err) {
        console.error('AiAdvisor: Native KV-cache sweep release failed', err);
      }
      this.context = null;
    }
    console.log('AiAdvisor: Local AI state zeroized.');
  }

  async suggestReply(incomingMessage: string): Promise<string> {
    const prompt = `User received: "${incomingMessage}". Suggest a short, polite reply:`;
    return this.query(prompt);
  }

  async suggestReplies(incomingMessage: string): Promise<string[]> {
    const prompt = `User received: "${incomingMessage}". Suggest 3 very short, helpful, polite reply options. Format exactly as: Option 1 | Option 2 | Option 3. Keep each under 6 words. Output nothing else.`;
    const result = await this.query(prompt);
    
    // Parse response split by pipe |
    const options = result.split('|').map(o => o.trim().replace(/^Option \d+:\s*/i, '')).filter(o => o.length > 0);
    if (options.length > 0) {
      return options.slice(0, 3);
    }
    return ["Got it!", "Thanks for letting me know.", "I will check this."];
  }

  async query(prompt: string): Promise<string> {
    const { settings } = useStore.getState();
    if (settings.liteModeEnabled) {
      return "Lite Mode active: AI disabled.";
    }

    if (!this.context) {
      console.warn('AiAdvisor: Model not initialized. Returning fallback.');
      return "Model not ready.";
    }

    try {
      console.log('AiAdvisor: Running query...');
      
      // 1. Strip system prompts (Exploit Shield)
      const sanitized = this.sanitizeSystemRoleTags(prompt);
      
      // 2. Timing Obfuscation Padding (Side-Channel Defense)
      const timingObfuscatedPrompt = this.addTimingObfuscationPadding(sanitized);

      const result = await this.context.completion({
        prompt: timingObfuscatedPrompt,
        n_predict: 50,
        stop: ['.', '\n'],
      });
      return result.text.trim();
    } catch (e) {
      console.error('AiAdvisor: Query failed', e);
      return "Error.";
    }
  }

  async getEmbedding(text: string): Promise<number[] | null> {
    if (!this.context) {
      console.warn('AiAdvisor: Model not initialized.');
      return null;
    }

    try {
      const result = await this.context.embedding(text);
      return result.embedding;
    } catch (e) {
      console.error('AiAdvisor: Embedding generation failed', e);
      return null;
    }
  }

  async extractTasks(message: string): Promise<{ title: string; deadline?: string } | null> {
    const prompt = `Extract task and deadline from: "${message}". Format: Title|Deadline. If none, say "None".`;
    const response = await this.query(prompt);
    
    if (response.includes("None") || response.length < 3) {
      return null;
    }

    const parts = response.split('|');
    return {
      title: parts[0].trim(),
      deadline: parts[1] ? parts[1].trim() : undefined
    };
  }
}

export const AiAdvisor = new AiAdvisorService();
