import { GoogleGenAI } from "@google/genai";

// We strictly follow the provided documentation for Gemini initialization.
const getClient = () => {
    // Check if API KEY is available. In a real app this comes from env. 
    // For this demo, we handle the case gracefully if missing.
    const apiKey = process.env.API_KEY || ''; 
    if (!apiKey) return null;
    return new GoogleGenAI({ apiKey });
};

export const getContentRecommendation = async (playlistContext: string): Promise<string> => {
  const ai = getClient();
  if (!ai) return "AI services unavailable (Missing API Key)";

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Based on this list of available channel categories: ${playlistContext}. 
        Recommend one category to watch for a user who likes action and thrillers. 
        Keep it very short, under 20 words.`,
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
            model: 'gemini-3-flash-preview',
            contents: `Write a 2 sentence engaging synopsis for the movie/show: "${title}".`
        });
        return response.text || "No description available.";
    } catch (e) {
        return "No description available.";
    }
}