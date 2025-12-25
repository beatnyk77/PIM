import { AiAdvisor } from './AiAdvisor';

export type Tone = 'neutral' | 'happy' | 'angry' | 'sad' | 'anxious';

class ToneDetectorService {
  async detectTone(text: string): Promise<Tone> {
    if (!text.trim()) return 'neutral';

    const prompt = `Analyze the tone of this text: "${text}". 
    Choose one: neutral, happy, angry, sad, anxious.
    Tone:`;

    const result = await AiAdvisor.query(prompt);
    const cleaned = result.toLowerCase().trim();

    if (cleaned.includes('happy')) return 'happy';
    if (cleaned.includes('angry')) return 'angry';
    if (cleaned.includes('sad')) return 'sad';
    if (cleaned.includes('anxious')) return 'anxious';
    
    return 'neutral';
  }
}

export const ToneDetector = new ToneDetectorService();
