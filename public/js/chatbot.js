const { GoogleGenAI } = require('@google/genai');

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
const chatContainer = document.getElementById('chat-container');
const messageList = document.getElementById('message-list');
const errorContainer = document.getElementById('error-container');
const promptForm = document.getElementById('prompt-form');
const promptInput = document.getElementById('prompt-input');
const promptSubmit = document.getElementById('prompt-submit');

// --- APPLICATION STATE ---
let messages = [];
let isLoading = false;
let chatHistory = [];

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

  // Ensure message.content is a string to prevent errors
  const messageContent = message.content || '';

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
    contentHtml = `<div class="message-content">${renderMarkdown(messageContent)}</div>`;
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
 * Handles sending a message to the backend API and streaming the response.
 * @param {string} userInput
 */
async function handleSendMessage(userInput) {
    if (isLoading) return;

    isLoading = true;
    clearError();

    messages.push({
        id: Date.now().toString(),
        role: 'user',
        content: userInput,
    });

    // Add user message to history
    chatHistory.push({ role: 'user', parts: [{ text: userInput }] });

    messages.push({
        id: 'loading-message',
        role: 'model',
        content: '',
    });

    render();

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: userInput,
                history: chatHistory.slice(0, -1) // Send history excluding the current user message
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            fullResponse += decoder.decode(value, { stream: true });
            messages[messages.length - 1].content = fullResponse;
            render();
        }
        
        // Add model response to history
        chatHistory.push({ role: 'model', parts: [{ text: fullResponse }] });


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
 * Initializes the application, sets up event listeners.
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

  messages.push({
    id: 'initial-message',
    role: 'model',
    content: 'Hello! How can I help you today?',
  });
  render();
}

// Start the application
init();
