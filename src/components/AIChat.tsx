import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Sparkles, X, Activity, Server, Box, AlertTriangle, Layers } from 'lucide-react';
import { BACKEND_URL, fetchWithRetry } from '../lib/api-client';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  actionPerformed?: string;
  actionSuccess?: boolean;
}

interface AIChatProps {
  isOpen: boolean;
  onClose: () => void;
}

// Render assistant message with basic markdown-like formatting
function MessageContent({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="text-sm leading-relaxed space-y-1">
      {lines.map((line, i) => {
        // Code block (inline `code`)
        const parts = line.split(/(`[^`]+`)/g);
        const rendered = parts.map((part, j) =>
          part.startsWith('`') && part.endsWith('`')
            ? <code key={j} className="bg-gray-200 dark:bg-gray-600 px-1 py-0.5 rounded text-xs font-mono">{part.slice(1, -1)}</code>
            : <span key={j}>{part}</span>
        );
        // Bold **text**
        const boldLine = rendered.map((el, j) => {
          if (typeof el === 'string') {
            return el.replace(/\*\*(.+?)\*\*/g, '$1');
          }
          return el;
        });
        // Section headers (lines starting with ##/###)
        if (/^#{1,3}\s/.test(line)) {
          return <p key={i} className="font-semibold text-blue-600 dark:text-blue-400 mt-2">{line.replace(/^#{1,3}\s/, '')}</p>;
        }
        // Bullet points
        if (/^[-•*]\s/.test(line)) {
          return <p key={i} className="pl-3">• {line.replace(/^[-•*]\s/, '')}</p>;
        }
        // Numbered list
        if (/^\d+\.\s/.test(line)) {
          return <p key={i} className="pl-3">{line}</p>;
        }
        if (line.trim() === '') return <br key={i} />;
        return <p key={i}>{rendered}</p>;
      })}
    </div>
  );
}

const SUGGESTION_GROUPS = [
  { icon: Activity,      label: 'Cluster health',           query: 'Analyze cluster health and show all issues' },
  { icon: Box,           label: 'Unhealthy pods',            query: 'Show all unhealthy, failed and pending pods' },
  { icon: Server,        label: 'Node status',               query: 'Show all nodes and their status' },
  { icon: Layers,        label: 'Deployments',               query: 'Show all deployments and their replica status' },
  { icon: AlertTriangle, label: 'Warning events',            query: 'Show recent warning and error events' },
  { icon: Box,           label: 'Create nginx pod',          query: 'Create nginx pod in tharunreddy-dev' },
  { icon: Layers,        label: 'Namespaces',                query: 'List all namespaces and projects' },
  { icon: AlertTriangle, label: 'Failed deployments',        query: 'Show failed or degraded deployments' },
];

type AIProvider = 'watsonx' | 'ica';

export default function AIChat({ isOpen, onClose }: AIChatProps) {
  const [provider, setProvider] = useState<AIProvider>('watsonx');
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hello! I\'m your OpenShift AI assistant.\n\nI am connected to your live cluster and can:\n\n• Show pods, nodes, deployments, events and namespaces\n• Diagnose CrashLoopBackOff, OOMKilled, Pending pods\n• Analyze cluster health with AI insights\n• Explain warning events and suggest fixes\n• Answer any OpenShift / Kubernetes question\n\nPick a quick action below or type your question.',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: messageText, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const conversationHistory = messages.slice(-8).map(m => ({
        role: m.role,
        content: m.content,
      }));

      // Route to the correct backend endpoint based on selected provider
      const endpoint = provider === 'ica' ? '/api/chat/ica' : '/api/chat';
      const response = await fetchWithRetry(`${BACKEND_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          conversation_history: conversationHistory,
          include_context: true,
        }),
      }, { timeout: 120000 });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Chat request failed: ${err}`);
      }
      const data = await response.json();
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        actionPerformed: data.action_performed ?? undefined,
        actionSuccess: data.action_success ?? undefined,
      }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: error instanceof Error
          ? `Error: ${error.message}. Please ensure the backend server is running on http://localhost:8001`
          : 'Sorry, I encountered an error. Please ensure the backend server is accessible.',
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                OpenShift AI Assistant
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {provider === 'ica' ? 'Powered by IBM Consulting Advantage' : 'Powered by IBM watsonx.ai'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* AI Provider toggle */}
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
              <button
                onClick={() => setProvider('watsonx')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  provider === 'watsonx'
                    ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                watsonx
              </button>
              <button
                onClick={() => setProvider('ica')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  provider === 'ica'
                    ? 'bg-white dark:bg-gray-600 text-purple-600 dark:text-purple-400 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                ICA
              </button>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-white" />
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white text-sm'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                }`}
              >
                {message.actionPerformed && (
                  <div className={`flex items-center gap-2 text-xs font-medium px-2 py-1 rounded-lg mb-2 ${
                    message.actionSuccess
                      ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                      : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                  }`}>
                    <span>{message.actionSuccess ? '✅' : '❌'}</span>
                    <span>{message.actionPerformed}</span>
                  </div>
                )}
                {message.role === 'assistant'
                  ? <MessageContent content={message.content} />
                  : <p className="text-sm leading-relaxed">{message.content}</p>
                }
                <p className="text-xs mt-2 opacity-60">
                  {message.timestamp.toLocaleTimeString()}
                </p>
              </div>
              {message.role === 'user' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  <span className="text-sm text-gray-600 dark:text-gray-300">Fetching live cluster data...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick-action suggestion chips */}
        {messages.length === 1 && (
          <div className="px-6 pb-4">
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
              Quick actions
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SUGGESTION_GROUPS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggestionClick(s.query)}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700/60 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-gray-700 dark:text-gray-300 hover:text-blue-700 dark:hover:text-blue-300 border border-gray-200 dark:border-gray-600 rounded-xl transition-colors text-left"
                >
                  <s.icon className="w-4 h-4 flex-shrink-0 text-blue-500" />
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me anything about your OpenShift cluster..."
              disabled={isLoading}
              className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 border-0 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Send className="w-5 h-5" />
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// Made with Bob
