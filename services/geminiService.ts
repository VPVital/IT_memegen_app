import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { ComicData, MemeData, GenerationType } from "../types";

// Constants for Models
const TEXT_MODEL = 'gemini-2.5-flash';
const IMAGE_MODEL_FAST = 'gemini-2.5-flash-image';
const IMAGE_MODEL_QUALITY = 'imagen-3.0-generate-001';

// Helper to strip markdown formatting and find JSON object
const cleanJson = (text: string): string => {
  if (!text) return '{}';
  
  // 1. Try to find markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1];
  }

  // 2. If no code block, try to find the first outer curly braces
  const startIndex = text.indexOf('{');
  const endIndex = text.lastIndexOf('}');
  
  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    return text.substring(startIndex, endIndex + 1);
  }
  
  return text;
};

// Helper for retrying async operations with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>, 
  retries: number = 3, 
  delay: number = 2000
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries <= 0) throw error;
    
    // Check for network/server errors (5xx), specific XHR errors, or Rate Limits (429)
    // Extended to handle complex nested error objects from Google API
    const shouldRetry = 
      (error?.status && error.status >= 500) || 
      error?.status === 429 ||
      error?.message?.includes('xhr error') || 
      error?.message?.includes('fetch failed') ||
      error?.message?.includes('NetworkError') ||
      error?.message?.includes('500') ||
      error?.message?.includes('503') ||
      // Handle nested error object structure: { error: { code: 500, message: ... } }
      (error?.error?.code === 500) ||
      (error?.error?.message?.includes('xhr error'));

    if (shouldRetry) {
      console.warn(`API call failed, retrying in ${delay}ms... (${retries} attempts left). Error:`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(fn, retries - 1, delay * 2);
    }
    
    throw error;
  }
}

/**
 * Generates the text content (prompts and captions) for a single meme.
 */
export const generateMemeText = async (topic: string): Promise<Omit<MemeData, 'id' | 'isLoading' | 'timestamp'>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `Generate a witty, sarcastic IT/Programmer meme idea about: "${topic}".
  The humor should be relatable to software engineers (bugs, managers, deadlines, legacy code, git).
  
  Return a JSON object with:
  1. visualPrompt: A detailed visual description for an image generator. Keep it simple and iconic.
  2. topText: The setup text (Russian language). Short and punchy.
  3. bottomText: The punchline (Russian language). Short and punchy.
  
  Keep visualPrompt in English.`;

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

    const rawText = response.text || '{}';
    const textResponse = JSON.parse(cleanJson(rawText));

    return {
      type: GenerationType.SINGLE,
      visualPrompt: textResponse.visualPrompt || "A funny programmer computer screen",
      topText: textResponse.topText || "",
      bottomText: textResponse.bottomText || "",
    };
  } catch (error) {
    console.error("Meme text generation failed:", error);
    // Fallback data to prevent crash
    return {
      type: GenerationType.SINGLE,
      visualPrompt: "Blue screen of death with confused programmer",
      topText: "Когда код упал",
      bottomText: "А ты не знаешь почему",
    };
  }
};

/**
 * Generates the script for a 3-4 panel comic strip.
 */
export const generateComicScript = async (topic: string, panelCount: number): Promise<Omit<ComicData, 'id' | 'isLoading' | 'styleLabel' | 'timestamp'>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `Create a funny ${panelCount}-panel comic strip script about: "${topic}" for IT professionals.
  
  Return a JSON object with an array of panels.
  Each panel must have:
  1. description: Visual description for image generator (in English). Keep descriptions generic regarding art style (e.g., "A programmer staring at screen") so style can be applied later. The setting should be minimal.
  2. caption: The dialogue/text for that panel (in Russian).
  
  Ensure there is a narrative arc with a setup and a punchline in the final panel.`;

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
              },
            },
          },
        },
      },
    }));

    const rawText = response.text || '{}';
    let json;
    try {
        json = JSON.parse(cleanJson(rawText));
    } catch (e) {
        console.error("JSON Parse failed for comic script", rawText);
        json = { panels: [] };
    }

    // Ensure panels is an array to prevent .map crashes in App.tsx
    const panels = Array.isArray(json.panels) ? json.panels : [];

    return {
      type: GenerationType.COMIC,
      topic,
      panels: panels,
    };
  } catch (error) {
    console.error("Comic script generation failed:", error);
    return {
      type: GenerationType.COMIC,
      topic,
      panels: [], 
    };
  }
};

/**
 * Generates an image based on a prompt.
 * Uses a robust fallback strategy: Tries Flash (fast) first, then Imagen (quality/stable).
 */
export const generateImageFromPrompt = async (fullPrompt: string): Promise<string | undefined> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // 1. Attempt with Flash Image (Fast, but sometimes unstable on Preview)
  try {
    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: IMAGE_MODEL_FAST,
      contents: {
        parts: [{ text: fullPrompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1", 
        }
      }
    }), 1, 1000); // Only 1 retry for flash to fail fast

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  } catch (error) {
    console.warn("Primary image model failed, switching to fallback (Imagen 3)...", error);
  }

  // 2. Fallback to Imagen 3 (More stable, higher quality, stricter quota)
  try {
    console.log("Attempting fallback generation with Imagen 3...");
    const response = await retryWithBackoff<any>(() => ai.models.generateImages({
        model: IMAGE_MODEL_QUALITY,
        prompt: fullPrompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: '1:1',
        },
    }), 2, 3000); // 2 retries for fallback

    const base64String = response.generatedImages?.[0]?.image?.imageBytes;
    if (base64String) {
      return `data:image/jpeg;base64,${base64String}`;
    }
  } catch (error) {
    console.error("Fallback image generation failed", error);
    return undefined;
  }

  return undefined;
};