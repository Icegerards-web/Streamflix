import { GoogleGenAI } from "@google/genai";

// Initialization helper
const getClient = () => {
    // The API key must be obtained exclusively from the environment variable process.env.API_KEY.
    // We assume process.env.API_KEY is available and valid.
    const apiKey = process.env.API_KEY;
    if (!apiKey) return null;
    return new GoogleGenAI({ apiKey });
};

export const getContentRecommendation = async (playlistContext: string): Promise<string> => {
  const ai = getClient();
  if (!ai) return "AI services unavailable (Missing API Key)";

  try {
    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `
        Based on this list of available channel categories: ${playlistContext}. 
        Recommend one category to watch for a user who likes action and thrillers. 
        Keep it very short, under 20 words.
    `
    });
    
    return response.text || "Check out the Action category!";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Explore our trending selection.";
  }
};

export const enhanceDescription = async (title: string): Promise<string> => {
    const ai = getClient();
    if (!ai) return "No description available.";

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `Write a 2 sentence engaging synopsis for the movie/show: "${title}".`
        });
        return response.text || "No description available.";
    } catch (e) {
        return "No description available.";
    }
}