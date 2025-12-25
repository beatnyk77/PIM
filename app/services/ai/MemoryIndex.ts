interface MemoryItem {
  id: string;
  text: string;
  embedding: number[];
  timestamp: number;
}

class MemoryIndexService {
  private memories: MemoryItem[] = [];

  // Cosine similarity
  private similarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  addMemory(text: string, embedding: number[]) {
    this.memories.push({
      id: Date.now().toString() + Math.random().toString(),
      text,
      embedding,
      timestamp: Date.now(),
    });
    console.log(`MemoryIndex: Added memory "${text.substring(0, 20)}..."`);
  }

  search(queryEmbedding: number[], limit: number = 3): MemoryItem[] {
    if (this.memories.length === 0) return [];

    const scored = this.memories.map(item => ({
      item,
      score: this.similarity(queryEmbedding, item.embedding),
    }));

    // Sort descending
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map(s => s.item);
  }

  clear() {
    this.memories = [];
  }
}

export const MemoryIndex = new MemoryIndexService();
