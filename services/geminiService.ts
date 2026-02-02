import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialization helper
const getClient = () => {
    // Check if API KEY is available. 
    // In Vite, env vars are exposed via import.meta.env, but process.env is often polyfilled.
    // We check both for compatibility.
    const apiKey = import.meta.env.VITE_API_KEY || process.env.API_KEY;
    if (!apiKey) return null;
    return new GoogleGenerativeAI(apiKey);
};

export const getContentRecommendation = async (playlistContext: string): Promise<string> => {
  const genAI = getClient();
  if (!genAI) return "AI services unavailable (Missing API Key)";

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const result = await model.generateContent(`
        Based on this list of available channel categories: ${playlistContext}. 
        Recommend one category to watch for a user who likes action and thrillers. 
        Keep it very short, under 20 words.
    `);
    
    return result.response.text() || "Check out the Action category!";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Explore our trending selection.";
  }
};

export const enhanceDescription = async (title: string): Promise<string> => {
    const genAI = getClient();
    if (!genAI) return "No description available.";

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(`Write a 2 sentence engaging synopsis for the movie/show: "${title}".`);
        return result.response.text() || "No description available.";
    } catch (e) {
        return "No description available.";
    }
}