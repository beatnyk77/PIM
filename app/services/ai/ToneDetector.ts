import { AiAdvisor } from './AiAdvisor';

export type Tone = 'neutral' | 'happy' | 'angry' | 'sad' | 'anxious' | 'defensive';

class ToneDetectorService {
  async detectTone(text: string): Promise<Tone> {
    if (!text.trim()) return 'neutral';

    const prompt = `Classify text tone as neutral, happy, angry, sad, anxious, or defensive. Output ONE word only. Text: "${text}" ->`;

    const result = await AiAdvisor.query(prompt);
    const cleaned = result.toLowerCase().trim();

    if (cleaned.includes('happy')) return 'happy';
    if (cleaned.includes('angry')) return 'angry';
    if (cleaned.includes('sad')) return 'sad';
    if (cleaned.includes('anxious')) return 'anxious';
    if (cleaned.includes('defensive')) return 'defensive';
    
    return 'neutral';
  }
}

export const ToneDetector = new ToneDetectorService();
