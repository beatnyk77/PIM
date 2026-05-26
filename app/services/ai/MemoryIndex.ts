import { saveMemory, getMemories, clearMemories } from '../storage/LocalDb';

export interface MemoryItem {
  id: string;
  text: string;
  embedding: number[];
  timestamp: number;
}

class MemoryIndexService {
  // Cosine similarity
  private similarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async addMemory(text: string, embedding: number[]): Promise<void> {
    await saveMemory(text, embedding);
    console.log(`MemoryIndex: Added persistent memory "${text.substring(0, 20)}..."`);
  }

  async search(queryEmbedding: number[], limit: number = 3): Promise<MemoryItem[]> {
    const memories = await getMemories();
    if (memories.length === 0) return [];

    const scored = memories.map(item => ({
      item,
      score: this.similarity(queryEmbedding, item.embedding),
    }));

    // Sort descending
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map(s => s.item);
  }

  async clear(): Promise<void> {
    await clearMemories();
    console.log('MemoryIndex: Cleared all persistent memories');
  }
}

export const MemoryIndex = new MemoryIndexService();
