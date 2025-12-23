
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { ComicData, MemeData, GenerationType } from "../types";

const TEXT_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODELS_PRIORITY = [
  'gemini-2.5-flash-image',
  'imagen-4.0-generate-001',
];

export interface ImageGenerationResult {
    imageUrl?: string;
    error?: string;
    isQuotaError?: boolean;
}

const cleanJson = (text: string): string => {
  if (!text) return '{}';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? jsonMatch[0] : text;
};

async function retryWithBackoff<T>(
  fn: () => Promise<T>, 
  retries: number = 2, 
  delay: number = 2000
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const status = error?.status || error?.code || 0;
    if (status === 429 && retries > 0) {
      console.warn(`[QA-Retry] Rate limit hit. Waiting ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
      return retryWithBackoff(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export const generateMemeText = async (topic: string): Promise<Omit<MemeData, 'id' | 'isLoading' | 'timestamp'>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `System: Senior Dev Humor. Topic: "${topic.substring(0, 100)}".
  Format: JSON { "visualPrompt": "string in English", "topText": "Russian", "bottomText": "Russian" }`;

  try {
    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            visualPrompt: { type: Type.STRING },
            topText: { type: Type.STRING },
            bottomText: { type: Type.STRING },
          },
          required: ["visualPrompt", "topText", "bottomText"],
        },
      },
    })); 

    const data = JSON.parse(cleanJson(response.text));
    return {
      type: GenerationType.SINGLE,
      visualPrompt: data.visualPrompt,
      topText: data.topText,
      bottomText: data.bottomText,
    };
  } catch (error) {
    return {
      type: GenerationType.SINGLE,
      visualPrompt: "Programmer at a computer",
      topText: "Когда деплоишь на Vercel",
      bottomText: "И оно наконец-то (почти) работает",
    };
  }
};

export const generateComicScript = async (topic: string, panelCount: number): Promise<Omit<ComicData, 'id' | 'isLoading' | 'styleLabel' | 'timestamp'>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Task: ${panelCount} panel IT comic about ${topic}. JSON output.`;

  try {
    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            panels: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  panelNumber: { type: Type.INTEGER },
                  description: { type: Type.STRING },
                  caption: { type: Type.STRING },
                },
                required: ["panelNumber", "description", "caption"]
              }
            }
          },
          required: ["panels"]
        }
      },
    }));

    const json = JSON.parse(cleanJson(response.text));
    return { type: GenerationType.COMIC, topic, panels: json.panels || [] };
  } catch (error) {
    throw error;
  }
};

export const generateImageFromPrompt = async (fullPrompt: string): Promise<ImageGenerationResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  // Sanitize prompt for Imagen (remove quotes and extra long text)
  const safePrompt = fullPrompt.replace(/["']/g, '').substring(0, 500);

  for (const model of IMAGE_MODELS_PRIORITY) {
    try {
      if (model.includes('imagen')) {
        const res = await ai.models.generateImages({ model, prompt: safePrompt });
        const b64 = res.generatedImages?.[0]?.image?.imageBytes;
        if (b64) return { imageUrl: `data:image/png;base64,${b64}` };
      } else {
        const res = await ai.models.generateContent({
          model,
          contents: { parts: [{ text: safePrompt }] },
        });
        const part = res.candidates?.[0]?.content?.parts.find(p => p.inlineData);
        if (part?.inlineData) return { imageUrl: `data:image/png;base64,${part.inlineData.data}` };
      }
    } catch (e: any) {
      if (e?.status === 429) return { isQuotaError: true, error: "RATE_LIMIT" };
      console.warn(`[QA-Image] ${model} failed:`, e?.status);
    }
  }
  return { error: "FAILED" };
};
