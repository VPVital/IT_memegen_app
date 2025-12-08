import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { ComicData, MemeData, GenerationType } from "../types";

// Constants for Models
const TEXT_MODEL = 'gemini-2.5-flash';

// Prioritized list of models to try for images.
// If one returns 429 (Quota), we switch to the next.
// Added more fallback options.
const IMAGE_MODELS_PRIORITY = [
  'gemini-2.5-flash-image',      // Primary: Standard Preview
  'imagen-3.0-generate-001',     // Secondary: High Quality (often separate quota)
  'gemini-3-pro-image-preview',  // Backup: Heavy duty
];

export interface ImageGenerationResult {
    imageUrl?: string;
    error?: string;
}

// Helper to strip markdown formatting and find JSON object
// Optimized for Robustness (Preventing syntax errors)
const cleanJson = (text: string): string => {
  if (!text) return '{}';
  
  // 1. Regex to extract content strictly between the first { and the last }
  // This handles cases where AI adds text before/after or markdown blocks
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  
  if (jsonMatch) {
    return jsonMatch[0];
  }
  
  return text;
};

// Helper for retrying async operations with exponential backoff
// MODIFIED: Now allows retrying on 429 (Too Many Requests) to handle RPM spikes.
async function retryWithBackoff<T>(
  fn: () => Promise<T>, 
  retries: number = 3, 
  delay: number = 2000
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    // Stop if no retries left
    if (retries <= 0) throw error;

    const status = error?.status || error?.code;
    
    // Determine if we should retry
    // We explicitly retry on 429 now, as it's often a temporary rate limit (RPM)
    const shouldRetry = 
      status === 429 ||
      status === 503 ||
      status === 500 ||
      error?.message?.includes('xhr') || 
      error?.message?.includes('fetch') ||
      error?.message?.includes('network') ||
      (error?.error?.code === 500) ||
      (error?.error?.code === 429);

    if (shouldRetry) {
      // If it's a 429, wait longer to let the bucket refill
      const waitTime = (status === 429) ? delay * 2 : delay;
      // console.log(`Retrying API call (${retries} left) after ${waitTime}ms... Error: ${status}`);
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return retryWithBackoff(fn, retries - 1, waitTime * 1.5);
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
    }), 3, 2000); // More robust retries for text too

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
    }), 3, 2000);

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
        // console.log(`Trying image model: ${modelName}`);
        
        // Imagen 3 uses generateImages, others use generateContent
        if (modelName.includes('imagen')) {
             const response = await retryWithBackoff<any>(() => ai.models.generateImages({
                model: modelName,
                prompt: fullPrompt,
                config: { numberOfImages: 1, outputMimeType: 'image/jpeg' }, 
            }), 3, 2000); // 3 retries, starting at 2s delay
            
            const base64String = response.generatedImages?.[0]?.image?.imageBytes;
            if (base64String) {
                return { imageUrl: `data:image/jpeg;base64,${base64String}` };
            }

        } else {
            // Flash/Pro models
            const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
                model: modelName,
                contents: { parts: [{ text: fullPrompt }] },
            }), 3, 2000); // 3 retries, starting at 2s delay

            for (const part of response.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData) {
                    return { imageUrl: `data:image/png;base64,${part.inlineData.data}` };
                }
            }
        }

      } catch (error: any) {
          const status = error.status || error.code;
          const msg = error.message || String(error);
          
          // Debug logging
          // console.warn(`Model ${modelName} failed:`, msg);
          
          if (status === 429) {
             lastError = "429 Quota Exceeded";
             // If we exhausted retries within retryWithBackoff and STILL got 429,
             // we need to wait a significant amount of time before trying the next model
             // to allow the shared rate limiter to cool down.
             await new Promise(resolve => setTimeout(resolve, 3000));
          } else {
             lastError = msg;
             // For other errors, sleep a bit before trying next model
             await new Promise(resolve => setTimeout(resolve, 1000));
          }
      }
  }

  // If all models fail
  console.error("All image models failed. Last error:", lastError);
  return { error: lastError };
};