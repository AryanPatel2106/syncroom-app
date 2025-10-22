const { GoogleGenerativeAI } = require("@google/generative-ai");

// Access your API key as an environment variable
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// The user specified "gemini-pro-latest", which corresponds to "gemini-pro" in the SDK
const model = genAI.getGenerativeModel({ model: "gemini-pro-latest" });

/**
 * Generates a response from the Gemini AI model.
 * @param {string} prompt The user's message to the AI.
 * @returns {Promise<string>} The AI's text response.
 */
async function getAiResponse(prompt, history) {
  try {
    const cleanPrompt = prompt.replace(/@ai/i, '').trim();
    if (!cleanPrompt) {
      return "Please provide a message.";
    }

    const chat = model.startChat({
      history: history,
      generationConfig: {
        maxOutputTokens: 500,
      },
    });

    const result = await chat.sendMessage(cleanPrompt);
    const response = await result.response;
    const text = response.text();
    return text;
  } catch (error) {
    console.error("Error getting AI response from Gemini:", error);
    // Check for specific safety-related errors
    if (error.message && error.message.includes('SAFETY')) {
        return "I cannot respond to that request as it violates safety policies.";
    }
    return "Sorry, I'm having trouble connecting to my circuits right now.";
  }
}

module.exports = { getAiResponse };
