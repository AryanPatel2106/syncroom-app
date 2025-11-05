/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, {useEffect, useRef, useState} from 'react';
import {SendIcon} from './icons';

interface PromptFormProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
}

const PromptForm: React.FC<PromptFormProps> = ({onSendMessage, isLoading}) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = `${scrollHeight}px`;
    }
  }, [input]);

  const handleSubmit = () => {
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="relative w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="w-full flex items-end gap-2 bg-[#1f1f1f] border border-gray-600 rounded-2xl p-2 shadow-lg focus-within:ring-2 focus-within:ring-indigo-500">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message Gemini..."
          className="flex-grow bg-transparent focus:outline-none resize-none text-base text-gray-200 placeholder-gray-500 max-h-48 py-2 px-2"
          rows={1}
          disabled={isLoading}
        />
        <div className="relative group">
          <button
            type="submit"
            className="p-2.5 bg-indigo-600 rounded-full hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
            aria-label="Send message"
            disabled={isLoading || !input.trim()}>
            <SendIcon className="w-5 h-5 text-white" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default PromptForm;
