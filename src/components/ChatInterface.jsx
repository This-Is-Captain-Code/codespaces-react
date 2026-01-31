import React, { useState, useRef, useEffect } from 'react';
import { botAPI } from '../api/client';
import './ChatInterface.css';

export function ChatInterface({ bot, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setError('');
    setLoading(true);

    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    try {
      const response = await botAPI.sendMessage(userMessage);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: response.data.response || 'No response received'
      }]);
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to send message';
      setError(errorMsg);
      setMessages(prev => [...prev, { 
        role: 'error', 
        content: errorMsg 
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError('');
  };

  if (!bot) {
    return <div className="chat-empty">No bot available</div>;
  }

  if (bot.status !== 'running') {
    return (
      <div className="chat-interface">
        <div className="chat-not-ready">
          <p>Your bot is {bot.status}.</p>
          <p>Wait for deployment to complete before chatting.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-interface">
      <div className="chat-header">
        <div className="chat-title">
          <span className="chat-icon">💬</span>
          <span>Chat with {bot?.botName || 'Your Bot'}</span>
        </div>
        <div className="chat-actions">
          <button onClick={clearChat} className="clear-btn" title="Clear chat">
            Clear
          </button>
          {onClose && (
            <button onClick={onClose} className="close-btn" title="Close chat">
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-initial">
            <p>Start a conversation with your AI bot.</p>
            <p className="hint">Type a message below to begin.</p>
          </div>
        )}
        {messages.map((msg, idx) => (
          <div key={idx} className={`message message-${msg.role}`}>
            <div className="message-avatar">
              {msg.role === 'user' ? '👤' : msg.role === 'error' ? '⚠️' : '🤖'}
            </div>
            <div className="message-content">
              <div className="message-text">{msg.content}</div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="message message-assistant loading">
            <div className="message-avatar">🤖</div>
            <div className="message-content">
              <span className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-form" onSubmit={sendMessage}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={loading}
          autoFocus
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
        >
          {loading ? '...' : 'Send'}
        </button>
      </form>
    </div>
  );
}
