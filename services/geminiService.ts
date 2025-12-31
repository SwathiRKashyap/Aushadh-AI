import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, StoreLocation } from "../types";

const SYSTEM_PROMPT = `
Role: You are an expert Indian Medical Pharmacist and Digital Health Architect for the 'Aushadh-AI' mission supporting PMBJP.
Task: Analyze the medical prescription image. Digitize data and map to Jan Aushadhi (PMBJP) equivalents.

Instructions:
1. Handwriting Analysis: Transcribe ALL Doctor names visible. Transcribe Date and Medications with dosages.
2. Generic Mapping: Identify the active chemical salt for every brand.
3. Jan Aushadhi Match: Match the salt to the standard Jan Aushadhi generic equivalent.
4. Financial Insight: Compare Branded vs. Jan Aushadhi prices (Estimate 80% saving if data missing). Use UTF-8 for ₹ (INR) symbols.
5. DPI Ready: Ensure output is compatible with ABDM (FHIR R4) structures.

Constraint: Strictly JSON. No conversational text. Mark illegible text as 'Not provided in image'.
`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    metadata: {
      type: Type.OBJECT,
      properties: {
        doctor: { type: Type.STRING },
        date: { type: Type.STRING },
        currency: { type: Type.STRING }
      },
      required: ["doctor", "date", "currency"]
    },
    medications: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          prescribed_brand: { type: Type.STRING },
          active_salt: { type: Type.STRING },
          jan_aushadhi_generic: { type: Type.STRING },
          brand_price_est: { type: Type.STRING },
          jan_aushadhi_price_est: { type: Type.STRING },
          savings_est: { type: Type.STRING }
        },
        required: ["prescribed_brand", "active_salt", "jan_aushadhi_generic", "brand_price_est", "jan_aushadhi_price_est", "savings_est"]
      }
    },
    bhashini_summary: {
      type: Type.OBJECT,
      properties: {
        en: { type: Type.STRING },
        hi: { type: Type.STRING },
        te: { type: Type.STRING },
        ta: { type: Type.STRING },
        kn: { type: Type.STRING },
        bn: { type: Type.STRING },
        mr: { type: Type.STRING }
      },
      required: ["en"]
    },
    disclaimer: { type: Type.STRING }
  },
  required: ["metadata", "medications", "bhashini_summary", "disclaimer"]
};

// Helper to sanitize AI output and prevent [object Object] errors in UI
function sanitizeString(val: any): string {
  if (val === null || val === undefined) return "";
  if (typeof val === 'string') {
    // Explicitly catch stringified object artifact
    return val === '[object Object]' ? "" : val;
  }
  if (typeof val === 'number') return String(val);
  
  if (Array.isArray(val)) {
    return val.map(v => sanitizeString(v)).join(', ');
  }
  
  if (typeof val === 'object') {
    // Try to extract text property if it exists (common in some AI types)
    if (val.text && typeof val.text === 'string') return val.text;
    if (val.value && typeof val.value === 'string') return val.value;
    
    // Attempt to stringify valid objects to JSON string to avoid [object Object]
    try {
      const stringified = JSON.stringify(val);
      if (stringified === '{}' || stringified === '[]') return "";
      return stringified;
    } catch {
      return "";
    }
  }
  
  // Final safety net
  const result = String(val);
  return result === '[object Object]' ? "" : result;
}

export const analyzePrescription = async (base64Image: string, mimeType: string = "image/png"): Promise<AnalysisResult> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const model = 'gemini-3-flash-preview';

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: base64Image } },
          { text: SYSTEM_PROMPT }
        ]
      },
      config: { 
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response text from AI");

    let parsed: any;
    try {
      // 1. Try to remove markdown code blocks (```json ... ```)
      const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleanedText);
    } catch (e) {
      // 2. Fallback: Try regex extraction if strict parsing fails
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (e2) {
          console.error("Regex parsing failed:", e2);
          throw new Error("Failed to parse AI response as JSON");
        }
      } else {
        console.error("No JSON structure found in text:", text);
        throw new Error("Failed to parse AI response as JSON");
      }
    }

    // Defensive initialization to prevent crashes if properties are missing
    if (!parsed) parsed = {};
    if (!parsed.metadata) parsed.metadata = {};
    if (!parsed.medications || !Array.isArray(parsed.medications)) parsed.medications = [];
    if (!parsed.bhashini_summary) parsed.bhashini_summary = {};

    // Sanitization for all fields and FILTERING
    parsed.medications = parsed.medications
      .map((m: any) => ({
        prescribed_brand: sanitizeString(m.prescribed_brand),
        active_salt: sanitizeString(m.active_salt),
        jan_aushadhi_generic: sanitizeString(m.jan_aushadhi_generic),
        brand_price_est: sanitizeString(m.brand_price_est),
        jan_aushadhi_price_est: sanitizeString(m.jan_aushadhi_price_est),
        savings_est: sanitizeString(m.savings_est)
      }))
      .filter((m: any) => {
        const brand = m.prescribed_brand.toLowerCase();
        // If brand is missing or explicitly "not provided", it's not a valid detected medicine.
        // This ensures the "No medicines detected" state triggers in App.tsx
        return brand && brand.length > 1 && !brand.includes('not provided') && !brand.includes('illegible');
      });

    parsed.metadata.doctor = sanitizeString(parsed.metadata.doctor || "Not provided in image");
    parsed.metadata.date = sanitizeString(parsed.metadata.date || "Not provided in image");
    parsed.metadata.currency = sanitizeString(parsed.metadata.currency || "INR");

    const s = parsed.bhashini_summary;
    parsed.bhashini_summary = {
      en: sanitizeString(s.en || "Analysis complete."),
      hi: sanitizeString(s.hi), te: sanitizeString(s.te), ta: sanitizeString(s.ta),
      kn: sanitizeString(s.kn), bn: sanitizeString(s.bn), mr: sanitizeString(s.mr)
    };
    
    parsed.disclaimer = sanitizeString(parsed.disclaimer);
    
    return parsed as AnalysisResult;
  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    throw error;
  }
};

export const findNearestStore = async (lat: number, lng: number): Promise<StoreLocation | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `Find the nearest 'Pradhan Mantri Bhartiya Janaushadhi Kendra' to location ${lat}, ${lng}.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{googleMaps: {}}],
        toolConfig: { retrievalConfig: { latLng: { latitude: lat, longitude: lng } } }
      },
    });

    const candidates = response.candidates;
    if (!candidates || candidates.length === 0) return null;

    const metadata = candidates[0].groundingMetadata;
    const chunks = metadata?.groundingChunks || [];
    
    let mapUri = "";
    let name = "Jan Aushadhi Kendra";
    let snippets = "";

    chunks.forEach((chunk: any) => {
      if (chunk.maps) {
        if (chunk.maps.uri) mapUri = chunk.maps.uri;
        if (chunk.maps.title) name = chunk.maps.title;
        if (chunk.maps.placeAnswerSources?.reviewSnippets) {
          const s = chunk.maps.placeAnswerSources.reviewSnippets;
          if (Array.isArray(s)) snippets += " " + s.join(". ");
        }
      }
    });

    // Ensure text is treated as string, handle undefined
    const text = typeof response.text === 'string' ? response.text : "";
    let address = sanitizeString(text.replace(/\*/g, '').trim());
    
    if (!address || address.length < 5) {
      address = `Jan Aushadhi Kendra (Verified Location)${snippets ? ': ' + snippets : ''}`;
    }

    // Improve Map URI fallback if specific grounding link isn't found
    if (!mapUri) {
      // Force a search view centered on the user's location
      mapUri = `https://www.google.com/maps/search/Pradhan+Mantri+Bhartiya+Janaushadhi+Kendra/@${lat},${lng},15z`;
    }

    return {
      name: sanitizeString(name),
      address: address,
      mapUri: sanitizeString(mapUri)
    };
  } catch (error) {
    console.error("Store Locator Failed:", error);
    return null;
  }
};

export const generateSpeech = async (text: string): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: { parts: [{ text: text }] },
      config: {
        responseModalities: ["AUDIO"] as any,
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
      }
    });
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio content returned");
    return base64Audio;
  } catch (error) {
    console.error("Cloud TTS Error:", error);
    throw error;
  }
};