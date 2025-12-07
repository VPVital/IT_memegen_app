import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { ComicData, MemeData, GenerationType } from "../types";

// Constants for Models - Aggressive Fallback List
const TEXT_MODEL = 'gemini-2.5-flash';

// Prioritized list of models to try for images. 
// We include experimental models as they often have different quota pools or stability profiles.
const IMAGE_MODELS_PRIORITY = [
  'gemini-2.5-flash-image',      // Primary: Fast, Preview
  'gemini-2.0-flash-exp',        // Secondary: Experimental often works when Preview fails
  'imagen-3.0-generate-001',     // Tertiary: High Quality, Strict Quota
  'gemini-3-pro-image-preview'   // Fallback: Heavy duty, might be slower
];

export interface ImageGenerationResult {
    imageUrl?: string;
    error?: string;
}

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
  retries: number = 2, 
  delay: number = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries <= 0) throw error;
    
    const shouldRetry = 
      (error?.status && error.status >= 500) || 
      error?.status === 429 ||
      error?.message?.includes('xhr') || 
      error?.message?.includes('fetch') ||
      error?.message?.includes('500') ||
      error?.message?.includes('503') ||
      (error?.error?.code === 500);

    if (shouldRetry) {
      // console.warn(`Retrying... attempts left: ${retries}`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(fn, retries - 1, delay * 1.5);
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
    }));

    const rawText = response.text || '{}';
    let json;
    try {
        json = JSON.parse(cleanJson(rawText));
    } catch (e) {
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
                config: { numberOfImages: 1, outputMimeType: 'image/jpeg' }, // Removed aspectRatio to reduce errors
            }), 1, 1000);
            
            const base64String = response.generatedImages?.[0]?.image?.imageBytes;
            if (base64String) {
                return { imageUrl: `data:image/jpeg;base64,${base64String}` };
            }

        } else {
            // Flash/Pro models
            const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
                model: modelName,
                contents: { parts: [{ text: fullPrompt }] },
            }), 1, 1000);

            for (const part of response.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData) {
                    return { imageUrl: `data:image/png;base64,${part.inlineData.data}` };
                }
            }
        }

      } catch (error: any) {
          console.warn(`Model ${modelName} failed:`, error.message || error);
          if (error.message) lastError = error.message;
          if (error.status) lastError = `Status ${error.status}`;
          // Continue to next model
      }
  }

  // If all models fail
  console.error("All image models failed.");
  return { error: lastError };
};