import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { ComicData, MemeData, GenerationType } from "../types";

// Constants for Models
// Use 2.0 Flash as the stable base for text
const TEXT_MODEL = 'gemini-2.0-flash';

// Prioritized list of models to try for images.
// Updated to prioritize stable models over experimental/preview ones that might 404.
// Removed 'imagen-3.0-generate-001' as it often returns 404 on standard keys.
// 'gemini-2.0-flash' is multimodal and capable of generating images.
const IMAGE_MODELS_PRIORITY = [
  'gemini-2.0-flash',            // Stable Flash - Reliable
  'gemini-2.5-flash-image',      // Specialized Image Preview
];

export interface ImageGenerationResult {
    imageUrl?: string;
    error?: string;
}

// Helper to strip markdown formatting and find JSON object
const cleanJson = (text: string): string => {
  if (!text) return '{}';
  
  // Regex to extract content strictly between the first { and the last }
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }
  return text;
};

// Helper for retrying async operations with exponential backoff and Jitter
// Optimized for handling 429 Rate Limits in production
async function retryWithBackoff<T>(
  fn: () => Promise<T>, 
  retries: number = 2, 
  baseDelay: number = 4000,
  factor: number = 2
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    // Stop if no retries left
    if (retries <= 0) throw error;

    const status = error?.status || error?.code || error?.response?.status;
    const msg = error?.message || '';
    
    // Determine if we should retry
    const isQuotaError = status === 429 || msg.includes('429') || msg.includes('Quota') || msg.includes('Too Many Requests');
    const isServerError = status >= 500 && status < 600;
    const isNetworkError = msg.includes('xhr') || msg.includes('fetch') || msg.includes('network') || msg.includes('Failed to fetch');

    const shouldRetry = isQuotaError || isServerError || isNetworkError;

    if (shouldRetry) {
      // If 429, we MUST wait at least 10-12 seconds.
      // 5 Requests Per Minute = 1 request every 12 seconds.
      const minDelay = isQuotaError ? 12000 : baseDelay;
      
      // Jitter: Randomize to prevent thundering herd
      const jitter = 0.8 + Math.random() * 0.4; 
      const waitTime = Math.max(minDelay, baseDelay) * jitter;
      
      console.warn(`Retry (${retries} left) due to ${status || 'error'}. Waiting ${Math.round(waitTime/1000)}s...`);
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // For quota errors, we don't necessarily want exponential backoff (just constant wait is fine),
      // but for server errors, exponential is good.
      const nextDelay = isQuotaError ? baseDelay : baseDelay * factor;
      
      return retryWithBackoff(fn, retries - 1, nextDelay, factor);
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
    }), 2, 4000); 

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
  1. description: Visual description for image generator (in English). Keep generic regarding style.
  2. caption: The dialogue/text for that panel (in Russian).
  
  Ensure there is a narrative arc.`;

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
    }), 2, 4000);

    const rawText = response.text || '{}';
    let json;
    try {
        json = JSON.parse(cleanJson(rawText));
    } catch (e) {
        console.warn("JSON Parse Error, defaulting to empty panels", e);
        json = { panels: [] };
    }

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
 * Generates an image by aggressively trying multiple models.
 * Returns an object with either the imageUrl or a specific error message.
 */
export const generateImageFromPrompt = async (fullPrompt: string): Promise<ImageGenerationResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  let lastError = "Unknown Error";

  for (const modelName of IMAGE_MODELS_PRIORITY) {
      try {
        console.log(`Attempting image gen with ${modelName}...`);
        
        if (modelName.includes('imagen')) {
             const response = await retryWithBackoff<any>(() => ai.models.generateImages({
                model: modelName,
                prompt: fullPrompt,
                config: { numberOfImages: 1, outputMimeType: 'image/jpeg' }, 
            }), 1, 5000); 
            
            const base64String = response.generatedImages?.[0]?.image?.imageBytes;
            if (base64String) {
                return { imageUrl: `data:image/jpeg;base64,${base64String}` };
            }

        } else {
            // Flash/Pro models (Multimodal endpoints)
            // Note: Some Flash models might just return text describing the image if not prompted correctly,
            // but usually 'generateContent' with image-capable models works.
            const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
                model: modelName,
                contents: { parts: [{ text: fullPrompt }] },
            }), 1, 5000);

            let foundImage = false;
            for (const part of response.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData) {
                    return { imageUrl: `data:image/png;base64,${part.inlineData.data}` };
                }
            }
            
            if (!foundImage && response.text) {
               console.warn(`Model ${modelName} returned text instead of image:`, response.text.substring(0, 50));
               throw new Error(`Model returned text, not image`);
            }
        }

      } catch (error: any) {
          const status = error.status || error.code || error?.response?.status;
          const msg = error.message || String(error);
          
          lastError = msg;
          
          if (status === 429 || msg.includes('429')) {
             lastError = "429 Quota Exceeded";
             console.warn(`Model ${modelName} 429 exhausted. Switching models in 2s...`);
             await new Promise(resolve => setTimeout(resolve, 2000));
          } else if (status === 404 || msg.includes('404')) {
             // Model not found or not enabled
             console.warn(`Model ${modelName} not found (404). Switching...`);
          } else {
             console.warn(`Model ${modelName} failed with ${msg}. Switching...`);
          }
      }
  }

  console.error("All image models failed. Last error:", lastError);
  return { error: lastError };
};