import React, { useState, useRef, useEffect } from 'react';
import { chatAPI, openrouterService } from '../api/client';
import './ChatInterface.css';

export function ChatInterface({ agentId, agent }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState('openai/gpt-3.5-turbo');
  const [models, setModels] = useState([]);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadModels();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadModels = async () => {
    try {
      // Get available models from OpenRouter
      const availableModels = [
        { id: 'openai/gpt-4-turbo-preview', name: 'GPT-4 Turbo' },
        { id: 'openai/gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
        { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus' },
        { id: 'anthropic/claude-3-sonnet', name: 'Claude 3 Sonnet' },
      ];
      setModels(availableModels);
    } catch (error) {
      console.error('Failed to load models:', error);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || !agent || agent.state !== 'running') return;

    const userMessage = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await chatAPI.sendMessage(
        agentId,
        input,
        model,
        messages
      );

      const assistantMessage = {
        role: 'assistant',
        content: response.data.response,
        usage: response.data.usage,
        cost: response.data.cost,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage = {
        role: 'system',
        content: error.response?.data?.error || 'Failed to get response',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  if (!agent) {
    return <div className="chat-empty">Select an agent to start chatting</div>;
  }

  if (agent.state !== 'running') {
    return <div className="chat-empty">Agent is {agent.state}. Start it to begin chatting.</div>;
  }

  return (
    <div className="chat-interface">
      <div className="chat-header">
        <div>
          <h2>{agent.name}</h2>
          <p className="agent-model">
            Model: {models.find(m => m.id === model)?.name || model}
          </p>
        </div>
        <div className="model-selector">
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-initial">
            <p>Start a conversation with {agent.name}</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`message message-${msg.role}`}>
            <div className="message-content">{msg.content}</div>
            {msg.usage && (
              <div className="message-meta">
                <small>
                  Tokens: {msg.usage.totalTokens} | Cost: ${(msg.cost / 100).toFixed(4)}
                </small>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="message message-system">
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

      <form className="chat-input-form" onSubmit={handleSendMessage}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={loading || agent.state !== 'running'}
          autoFocus
        />
        <button
          type="submit"
          disabled={loading || !input.trim() || agent.state !== 'running'}
        >
          {loading ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
}
