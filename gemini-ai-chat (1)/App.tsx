/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {Chat, GoogleGenAI} from '@google/genai';
import React, {useEffect, useRef, useState} from 'react';
import {BotIcon, UserIcon} from './components/icons';
import PromptForm from './components/PromptForm';
import {ChatMessage} from './types';

const renderMarkdown = (text: string) => {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre><code class="language-${lang}">${code}</code></pre>`;
  });
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/\n/g, '<br />');
  html = html.replace(/<pre>(.*?)<\/pre>/gs, (match, code) => {
    return `<pre>${code.replace(/<br \/>/g, '\n')}</pre>`;
  });

  return {__html: html};
};

const App: React.FC = () => {
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
      const chatSession = ai.chats.create({
        model: 'gemini-2.5-pro',
        config: {
          systemInstruction:
            'You are a helpful and friendly AI assistant. Your responses should be formatted in markdown.',
        },
      });
      setChat(chatSession);
      setMessages([
        {
          id: 'initial-message',
          role: 'model',
          content: 'Hello! How can I help you today?',
        },
      ]);
    } catch (e) {
      console.error(e);
      setError(
        'Failed to initialize the AI chat. Please check your API key and configuration.',
      );
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
  }, [messages]);

  const handleSendMessage = async (userInput: string) => {
    if (!chat || isLoading) return;

    setIsLoading(true);
    setError(null);

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: userInput,
    };

    setMessages((prevMessages) => [
      ...prevMessages,
      userMessage,
      {id: 'loading-message', role: 'model', content: ''},
    ]);

    try {
      const stream = await chat.sendMessageStream({message: userInput});
      let fullResponse = '';

      for await (const chunk of stream) {
        fullResponse += chunk.text;
        setMessages((prevMessages) =>
          prevMessages.map((msg, index) =>
            index === prevMessages.length - 1
              ? {...msg, content: fullResponse}
              : msg,
          ),
        );
      }
    } catch (e) {
      console.error(e);
      const errorMessage =
        e instanceof Error ? e.message : 'An unknown error occurred.';
      setError(`Failed to get response: ${errorMessage}`);
      setMessages((prevMessages) =>
        prevMessages.slice(0, prevMessages.length - 1),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const ChatMessageBubble: React.FC<{message: ChatMessage}> = ({message}) => {
    const isModel = message.role === 'model';
    const isLoadingMessage =
      isModel && message.id === 'loading-message' && isLoading;

    return (
      <div
        className={`flex items-start gap-4 ${isModel ? '' : 'flex-row-reverse'}`}>
        <div
          className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${isModel ? 'bg-indigo-600/50' : 'bg-gray-600/50'}`}>
          {isModel ? (
            <BotIcon className="w-6 h-6 text-indigo-300" />
          ) : (
            <UserIcon className="w-6 h-6 text-gray-300" />
          )}
        </div>
        <div
          className={`max-w-xl md:max-w-2xl lg:max-w-3xl p-4 rounded-2xl ${isModel ? 'bg-gray-800 rounded-tl-none' : 'bg-indigo-700 rounded-tr-none'}`}>
          {isLoadingMessage ? (
            <div className="flex items-center justify-center gap-1.5 p-2">
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
            </div>
          ) : (
            <div
              className="message-content"
              dangerouslySetInnerHTML={renderMarkdown(message.content)}
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen bg-black text-gray-200 flex flex-col font-sans overflow-hidden">
      <header className="py-4 flex justify-center items-center px-8 relative z-10 border-b border-gray-800 shadow-md">
        <h1 className="text-3xl font-semibold tracking-wide text-center bg-gradient-to-r from-indigo-400 via-purple-500 to-pink-500 bg-clip-text text-transparent">
          Gemini AI Chat
        </h1>
      </header>
      <main
        id="chat-container"
        className="flex-grow flex flex-col p-4 overflow-y-auto">
        <div className="flex-grow space-y-6 p-4">
          {messages.map((msg, index) => (
            <ChatMessageBubble key={`${msg.id}-${index}`} message={msg} />
          ))}
          <div ref={messagesEndRef} />
        </div>
        {error && (
          <div className="my-4 text-center bg-red-900/20 border border-red-500 p-4 rounded-lg max-w-3xl w-full mx-auto">
            <p className="text-red-300">{error}</p>
          </div>
        )}
      </main>
      <footer className="w-full max-w-3xl mx-auto p-4">
        <PromptForm onSendMessage={handleSendMessage} isLoading={isLoading} />
      </footer>
    </div>
  );
};

export default App;
