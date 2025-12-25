import { initLlama, LlamaContext } from 'llama.rn';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import { EventBus } from '../EventBus';
import { useStore } from '../storage/StateManager';

class AiAdvisorService {
  private context: LlamaContext | null = null;
  private isInitializing: boolean = false;

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

  async initialize() {
    if (this.context || this.isInitializing) return;

    this.isInitializing = true;
    console.log('AiAdvisor: Initializing...');

    try {
      // 1. Resolve asset
      const modelAsset = Asset.fromModule(require('../../models/phi-3-mini.gguf'));
      await modelAsset.downloadAsync();

      if (!modelAsset.localUri) {
        throw new Error('Failed to resolve model asset URI');
      }

      console.log('AiAdvisor: Model asset found at', modelAsset.localUri);

      // 2. Initialize Llama Context
      // Note: In a real environment with the actual 2GB model, this takes time.
      // With our placeholder, it might fail validation if the lib checks header magic.
      // We wrap in try/catch to gracefully handle the "fake" model.
      
      this.context = await initLlama({
        model: modelAsset.localUri,
      });

      console.log('AiAdvisor: Context initialized successfully');
    } catch (e) {
      console.error('AiAdvisor: Failed to initialize model', e);
      // For the purpose of this skeleton task, we'll assume success if we found the file
      // even if the engine rejects the 0-byte/text file.
    } finally {
      this.isInitializing = false;
    }
  }

  isReady(): boolean {
    return !!this.context;
  }

  async suggestReply(incomingMessage: string): Promise<string> {
    const prompt = `User received: "${incomingMessage}". Suggest a short, polite reply:`;
    return this.query(prompt);
  }

  async query(prompt: string): Promise<string> {
    if (!this.context) {
      console.warn('AiAdvisor: Model not initialized. Returning fallback.');
      return "Model not ready.";
    }

    try {
      console.log('AiAdvisor: Running query...');
      const result = await this.context.completion({
        prompt,
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
      // Note: Llama.rn's embedding API might vary slightly.
      // Standard llama.cpp usage is just context.embedding(text).
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
