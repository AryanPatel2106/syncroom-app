const { GoogleGenerativeAI } = require("@google/generative-ai");

// Access your API key as an environment variable
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// The user specified "gemini-pro-latest", which corresponds to "gemini-pro" in the SDK
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

/**
 * Generates a response from the Gemini AI model.
 * @param {string} prompt The user's message to the AI.
 * @returns {Promise<string>} The AI's text response.
 */
async function getAiResponse(prompt) {
  try {
    // Remove the "@ai" trigger word from the prompt
    const cleanPrompt = prompt.replace(/@ai/i, '').trim();
    
    const result = await model.generateContent(cleanPrompt);
    const response = await result.response;
    const text = response.text();
    return text;
  } catch (error) {
    console.error("Error getting AI response from Gemini:", error);
    return "Sorry, I'm having trouble connecting to my circuits right now.";
  }
}

module.exports = { getAiResponse };
