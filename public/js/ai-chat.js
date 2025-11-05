// This script is inspired by the logic in the user-provided App.tsx

document.addEventListener('DOMContentLoaded', () => {
    const promptForm = document.getElementById('prompt-form');
    const promptInput = document.getElementById('prompt-input');
    const submitButton = document.getElementById('submit-button');
    const sendIcon = document.getElementById('send-icon');
    const loadingSpinner = document.getElementById('loading-spinner');
    const messageList = document.getElementById('message-list');
    const messagesEnd = document.getElementById('messages-end');
    const errorContainer = document.getElementById('error-container');
    const errorMessageEl = document.getElementById('error-message');

    let isLoading = false;
    let chatHistory = []; // To store the conversation history

    // --- Initialize API and Chat Model ---
    // This part is now handled on the server side via a new API endpoint.

    // --- Helper Functions ---
    const renderMarkdown = (text) => {
        // Basic markdown to HTML conversion
        let html = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

        // Code blocks
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            const escapedCode = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<pre><code class="language-${lang}">${escapedCode}</code></pre>`;
        });

        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        // Bold
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Italic
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
        // Newlines
        html = html.replace(/\n/g, '<br />');
        
        // Fix for newlines inside code blocks
        html = html.replace(/<pre>(.*?)<\/pre>/gs, (match, code) => {
            return `<pre>${code.replace(/<br \/>/g, '\n')}</pre>`;
        });

        return html;
    };

    const scrollToBottom = () => {
        messagesEnd.scrollIntoView({ behavior: 'smooth' });
    };

    const setLoadingState = (loading) => {
        isLoading = loading;
        submitButton.disabled = loading;
        if (loading) {
            sendIcon.classList.add('hidden');
            loadingSpinner.classList.remove('hidden');
        } else {
            sendIcon.classList.remove('hidden');
            loadingSpinner.classList.add('hidden');
        }
    };

    const displayError = (message) => {
        errorMessageEl.textContent = message;
        errorContainer.classList.remove('hidden');
    };

    const hideError = () => {
        errorContainer.classList.add('hidden');
    };


    const createChatMessageBubble = (role, content) => {
        const isModel = role === 'model';
        const bubble = document.createElement('div');
        bubble.className = `flex items-start gap-4 mb-6 message-bubble ${isModel ? '' : 'flex-row-reverse'}`;

        const iconHtml = isModel ?
            `<div class="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-indigo-100 dark:bg-indigo-900">
                <i class="fas fa-robot text-3xl text-indigo-500"></i>
            </div>` :
            `<div class="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-gray-200 dark:bg-gray-700">
                <i class="fas fa-user text-xl text-gray-600 dark:text-gray-300"></i>
            </div>`;

        const contentHtml = `
            <div class="max-w-xl md:max-w-2xl lg:max-w-3xl p-4 rounded-2xl shadow-md ${isModel ? 'bg-white dark:bg-gray-800 rounded-tl-none' : 'bg-indigo-600 text-white rounded-tr-none'}">
                <div class="prose prose-sm md:prose-base max-w-none text-gray-800 dark:text-gray-200">${renderMarkdown(content)}</div>
            </div>`;

        bubble.innerHTML = iconHtml + contentHtml;
        return bubble;
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        hideError();
        const userMessage = promptInput.value.trim();
        if (!userMessage || isLoading) return;

        setLoadingState(true);
        promptInput.value = '';

        // Add user message to UI
        const userBubble = createChatMessageBubble('user', userMessage);
        messageList.insertBefore(userBubble, messagesEnd);
        scrollToBottom();

        // Add user message to history
        chatHistory.push({ role: 'user', parts: [{ text: userMessage }] });

        // Add placeholder for model response
        const modelBubble = createChatMessageBubble('model', '');
        const modelContent = modelBubble.querySelector('.prose');
        modelContent.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        messageList.insertBefore(modelBubble, messagesEnd);
        scrollToBottom();

        try {
            const response = await fetch('/api/gemini-chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: userMessage,
                    history: chatHistory.slice(0, -1) // Send history without the current user message
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || `HTTP error! status: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let modelResponseText = '';
            modelContent.innerHTML = ''; // Clear spinner

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                modelResponseText += chunk;
                modelContent.innerHTML = renderMarkdown(modelResponseText);
                scrollToBottom();
            }
            
            // Add final model response to history
            chatHistory.push({ role: 'model', parts: [{ text: modelResponseText }] });
            
            // Highlight code blocks after streaming is complete
            modelBubble.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });

        } catch (error) {
            console.error('Chat error:', error);
            modelContent.innerHTML = ''; // Clear bubble content on error
            displayError(`Failed to get response from AI. ${error.message}`);
        } finally {
            setLoadingState(false);
            promptInput.focus();
        }
    };

    promptForm.addEventListener('submit', handleFormSubmit);
});
