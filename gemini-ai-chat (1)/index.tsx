/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI } from '@google/genai';

// This script creates the application structure and logic when the DOM is ready.
document.addEventListener('DOMContentLoaded', () => {
    // 1. Define the HTML structure for the application
    const appHTML = `
        <div class="h-screen bg-black text-gray-200 flex flex-col font-sans overflow-hidden">
            <header class="py-4 flex justify-center items-center px-8 relative z-10 border-b border-gray-800 shadow-md">
                <h1 class="text-3xl font-semibold tracking-wide text-center bg-gradient-to-r from-indigo-400 via-purple-500 to-pink-500 bg-clip-text text-transparent">
                    Gemini AI Chat
                </h1>
            </header>
            <main id="chat-container" class="flex-grow flex flex-col p-4 overflow-y-auto">
                <div id="message-list" class="flex-grow space-y-6 p-4">
                    <!-- Messages will be injected here -->
                </div>
                <div id="error-container" class="my-4 text-center max-w-3xl w-full mx-auto">
                    <!-- Error messages will be injected here -->
                </div>
            </main>
            <footer class="w-full max-w-3xl mx-auto p-4">
                <form id="prompt-form" class="relative w-full">
                    <div class="w-full flex items-end gap-2 bg-[#1f1f1f] border border-gray-600 rounded-2xl p-2 shadow-lg focus-within:ring-2 focus-within:ring-indigo-500">
                        <textarea
                            id="prompt-input"
                            placeholder="Message Gemini..."
                            class="flex-grow bg-transparent focus:outline-none resize-none text-base text-gray-200 placeholder-gray-500 max-h-48 py-2 px-2"
                            rows="1"
                        ></textarea>
                        <button
                            id="prompt-submit"
                            type="submit"
                            class="p-2.5 bg-indigo-600 rounded-full hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
                            aria-label="Send message"
                        >
                            <!-- Send Icon SVG is injected here -->
                        </button>
                    </div>
                </form>
            </footer>
        </div>
    `;

    // 2. Insert the HTML into the document body
    document.body.innerHTML = appHTML;

    // --- CSS STYLES ---
    const styles = `
    /* Custom scrollbar for webkit browsers */
    #chat-container::-webkit-scrollbar {
      width: 8px;
    }
    #chat-container::-webkit-scrollbar-track {
      background: #1f1f1f;
    }
    #chat-container::-webkit-scrollbar-thumb {
      background-color: #4f46e5;
      border-radius: 10px;
      border: 2px solid #1f1f1f;
    }

    /* Basic styling for rendered markdown elements */
    .message-content strong {
      font-weight: 600;
    }
    .message-content em {
      font-style: italic;
    }
    .message-content code:not(pre > code) {
      background-color: rgba(0,0,0,0.3);
      padding: 0.2em 0.4em;
      margin: 0;
      font-size: 85%;
      border-radius: 6px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }
    .message-content pre {
      background-color: #111827; /* gray-900 */
      border-radius: 0.5rem;
      padding: 1rem;
      overflow-x: auto;
      margin-top: 0.5rem;
      margin-bottom: 0.5rem;
      white-space: pre-wrap;
    }
    .message-content pre code {
      background-color: transparent;
      padding: 0;
      font-size: 100%;
      border-radius: 0;
    }
    `;

    // --- SVG ICONS ---
    const SendIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 text-white"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`;
    const BotIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6 text-indigo-300"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>`;
    const UserIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6 text-gray-300"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

    // --- DOM ELEMENT REFERENCES ---
    // Fix: Cast DOM elements to their specific types to resolve TypeScript errors.
    const chatContainer = document.getElementById('chat-container')!;
    const messageList = document.getElementById('message-list')!;
    const errorContainer = document.getElementById('error-container')!;
    const promptForm = document.getElementById('prompt-form') as HTMLFormElement;
    const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement;
    const promptSubmit = document.getElementById('prompt-submit') as HTMLButtonElement;

    // --- APPLICATION STATE ---
    let chat;
    let messages = [];
    let isLoading = false;

    // --- CORE LOGIC ---

    /**
     * Renders a markdown string to a sanitized HTML string.
     * @param {string} text - The markdown text to render.
     * @returns {string} The rendered HTML.
     */
    function renderMarkdown(text) {
      let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

      html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
        const escapedCode = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<pre><code class="language-${lang}">${escapedCode}</code></pre>`;
      });
      html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
      html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
      html = html.replace(/\n/g, '<br />');
      html = html.replace(/<pre>(.*?)<\/pre>/gs, (match, code) => {
        return `<pre>${code.replace(/<br \/>/g, '\n')}</pre>`;
      });

      return html;
    }

    /**
     * Creates the HTML for a single message bubble.
     * @param {object} message - The message object.
     * @returns {string} The HTML string for the message.
     */
    function createMessageBubble(message) {
      const isModel = message.role === 'model';
      const isLoadingMessage = isModel && message.id === 'loading-message' && isLoading;

      const authorIcon = isModel ? BotIconSVG : UserIconSVG;
      const authorBg = isModel ? 'bg-indigo-600/50' : 'bg-gray-600/50';
      const messageBg = isModel ? 'bg-gray-800 rounded-tl-none' : 'bg-indigo-700 rounded-tr-none';
      const flexDirection = isModel ? '' : 'flex-row-reverse';

      let contentHtml;
      if (isLoadingMessage) {
        contentHtml = `
          <div class="flex items-center justify-center gap-1.5 p-2">
            <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
            <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
            <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
          </div>`;
      } else {
        contentHtml = `<div class="message-content">${renderMarkdown(message.content)}</div>`;
      }

      return `
        <div class="flex items-start gap-4 ${flexDirection}">
          <div class="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${authorBg}">${authorIcon}</div>
          <div class="max-w-xl md:max-w-2xl lg:max-w-3xl p-4 rounded-2xl ${messageBg}">${contentHtml}</div>
        </div>`;
    }

    /**
     * Renders all messages and updates the UI state.
     */
    function render() {
      messageList.innerHTML = messages.map(createMessageBubble).join('');

      promptInput.disabled = isLoading;
      promptSubmit.disabled = isLoading || !promptInput.value.trim();
      promptInput.placeholder = isLoading ? "Awaiting response..." : "Message Gemini...";
      
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    /**
     * Handles sending a message to the Gemini API and streaming the response.
     * @param {string} userInput
     */
    async function handleSendMessage(userInput) {
      if (!chat || isLoading) return;

      isLoading = true;
      clearError();

      messages.push({
        id: Date.now().toString(),
        role: 'user',
        content: userInput,
      });
      
      messages.push({
        id: 'loading-message',
        role: 'model',
        content: '',
      });

      render();

      try {
        const stream = await chat.sendMessageStream({ message: userInput });
        let fullResponse = '';

        for await (const chunk of stream) {
          fullResponse += chunk.text;
          messages[messages.length - 1].content = fullResponse;
          render();
        }
      } catch (e) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        setError(`Failed to get response: ${errorMessage}`);
        messages.pop(); // Remove the loading message on error
      } finally {
        isLoading = false;
        if (messages.length > 0 && messages[messages.length - 1].id === 'loading-message') {
          messages[messages.length - 1].id = Date.now().toString();
        }
        render(); // Final render to update form state
      }
    }

    /**
     * Displays an error message in the UI.
     * @param {string} message - The error message to display.
     */
    function setError(message) {
      errorContainer.innerHTML = `
        <div class="bg-red-900/20 border border-red-500 p-4 rounded-lg">
          <p class="text-red-300">${message}</p>
        </div>`;
    }

    /**
     * Clears any visible error messages.
     */
    function clearError() {
      errorContainer.innerHTML = '';
    }

    /**
     * Adjusts the textarea's height to fit its content.
     */
    function autoResizeTextarea() {
      promptInput.style.height = 'auto';
      promptInput.style.height = `${promptInput.scrollHeight}px`;
    }

    /**
     * Injects CSS styles into the document head.
     */
    function injectStyles() {
      const styleElement = document.createElement('style');
      styleElement.textContent = styles;
      document.head.appendChild(styleElement);
    }

    /**
     * Initializes the application, sets up event listeners, and starts the AI chat.
     */
    function init() {
      injectStyles();
      promptSubmit.innerHTML = SendIconSVG;

      promptForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const userInput = promptInput.value.trim();
        if (userInput) {
          handleSendMessage(userInput);
          promptInput.value = '';
          autoResizeTextarea();
        }
      });

      promptInput.addEventListener('input', () => {
        autoResizeTextarea();
        promptSubmit.disabled = isLoading || !promptInput.value.trim();
      });

      promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          promptForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }
      });

      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        chat = ai.chats.create({
          model: 'gemini-2.5-pro',
          config: {
            systemInstruction: 'You are a helpful and friendly AI assistant. Your responses should be formatted in markdown.',
          },
        });

        messages.push({
          id: 'initial-message',
          role: 'model',
          content: 'Hello! How can I help you today?',
        });
        render();
      } catch (e) {
        console.error(e);
        setError('Failed to initialize the AI chat. Please check your API key and configuration.');
      }
    }

    // Start the application
    init();
});