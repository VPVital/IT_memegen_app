
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { ComicData, MemeData, GenerationType } from "../types";

// Latest high-performance models
const TEXT_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODELS_PRIORITY = [
  'gemini-2.5-flash-image',
  'imagen-4.0-generate-001',
];

export interface ImageGenerationResult {
    imageUrl?: string;
    error?: string;
}

const cleanJson = (text: string): string => {
  if (!text) return '{}';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? jsonMatch[0] : text;
};

async function retryWithBackoff<T>(
  fn: () => Promise<T>, 
  retries: number = 3, 
  delay: number = 1500,
  factor: number = 2
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries <= 0) throw error;
    const status = error?.status || error?.code || error?.response?.status;
    if (status === 429 || (status >= 500 && status < 600)) {
      const waitTime = delay + Math.random() * 500;
      console.warn(`[QA-Retry] Attempt failed (${status}). Retrying in ${Math.round(waitTime)}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return retryWithBackoff(fn, retries - 1, delay * factor, factor);
    }
    throw error;
  }
}

export const generateMemeText = async (topic: string): Promise<Omit<MemeData, 'id' | 'isLoading' | 'timestamp'>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `System: You are an elite Senior Developer with a dark sense of humor. 
  Topic: "${topic}".
  Task: Create a viral IT meme.
  Requirements: 
  - topText: Setup in Russian (max 50 chars).
  - bottomText: Punchline in Russian (max 80 chars).
  - visualPrompt: Detailed scene description in English for AI generator.
  Format: JSON only.`;

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
    console.error("[QA-Error] Meme Text Failure:", error);
    return {
      type: GenerationType.SINGLE,
      visualPrompt: "Developer crying at a desk",
      topText: "Когда пришел дебажить приложение",
      bottomText: "А оно просто не запускается",
    };
  }
};

export const generateComicScript = async (topic: string, panelCount: number): Promise<Omit<ComicData, 'id' | 'isLoading' | 'styleLabel' | 'timestamp'>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Create a ${panelCount}-panel tech comic strip about: "${topic}".
  Focus on programming/IT humor. Captions must be in Russian.
  Return exactly ${panelCount} panels.`;

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
                  description: { type: Type.STRING, description: "Detailed visual description for image AI in English" },
                  caption: { type: Type.STRING, description: "Funny punchline in Russian" },
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
    const validPanels = (json.panels || []).slice(0, panelCount);
    
    if (validPanels.length === 0) throw new Error("No panels generated");

    return { 
      type: GenerationType.COMIC, 
      topic, 
      panels: validPanels 
    };
  } catch (error) {
    console.error("[QA-Error] Comic Script Failure, using fallback:", error);
    return { 
      type: GenerationType.COMIC, 
      topic, 
      panels: [
        { panelNumber: 1, description: "Frustrated programmer looking at a glowing monitor", caption: "Когда видишь баг..." },
        { panelNumber: 2, description: "Programmer holding head in hands, server room background", caption: "И понимаешь, что это твой код..." },
        { panelNumber: 3, description: "Programmer drinking a lot of coffee, late at night", caption: "Просто еще один день в IT." },
      ] 
    };
  }
};

export const generateImageFromPrompt = async (fullPrompt: string): Promise<ImageGenerationResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  for (const model of IMAGE_MODELS_PRIORITY) {
    try {
      if (model.includes('imagen')) {
        const res = await ai.models.generateImages({ model, prompt: fullPrompt });
        const b64 = res.generatedImages?.[0]?.image?.imageBytes;
        if (b64) return { imageUrl: `data:image/png;base64,${b64}` };
      } else {
        const res = await ai.models.generateContent({
          model,
          contents: { parts: [{ text: fullPrompt }] },
        });
        const part = res.candidates?.[0]?.content?.parts.find(p => p.inlineData);
        if (part?.inlineData) return { imageUrl: `data:image/png;base64,${part.inlineData.data}` };
      }
    } catch (e) {
      console.warn(`[QA-Image] Model ${model} failed, switching...`);
    }
  }
  return { error: "IMAGE_GENERATION_FAILED" };
};
