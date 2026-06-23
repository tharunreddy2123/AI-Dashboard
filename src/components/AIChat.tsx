import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Sparkles, X } from 'lucide-react';
import { apiClient } from '../lib/api-client';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AIChatProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AIChat({ isOpen, onClose }: AIChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hello! I\'m your OpenShift AI assistant. I can help you with:\n\n• Analyzing cluster health\n• Troubleshooting pod issues\n• Explaining events and logs\n• Finding solutions in runbooks\n• Answering DevOps questions\n\n⚡ Note: The first response may take 20-30 seconds as the AI model loads into memory. Subsequent responses will be faster!\n\nWhat would you like to know?',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = [
    'Show unhealthy pods',
    'Analyze cluster health',
    'Why is my pod restarting?',
    'Troubleshoot Portworx migration',
    'Why is Grafana not starting?',
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const formatClusterHealthResponse = (healthData: any, aiAnalysis: string) => {
    const pods = healthData.pods || {};
    const nodes = healthData.nodes || {};
    const warnings = healthData.recent_warnings || [];

    const warningText = warnings.length
      ? warnings.map((event: any, index: number) => {
          const obj = event?.involvedObject || {};
          return `${index + 1}. ${event.type || 'Unknown'}: ${event.reason || 'Unknown'} in ${obj.kind || 'Unknown'}/${obj.name || 'Unknown'} (${obj.namespace || 'Unknown'}) - ${event.message || 'No message'}`;
        }).join('\n')
      : 'No recent warnings or errors.';

    return `Cluster Health Summary:\n` +
      `- Total Pods: ${pods.total ?? 'N/A'}\n` +
      `- Running Pods: ${pods.running ?? 'N/A'}\n` +
      `- Failed Pods: ${pods.failed ?? 'N/A'}\n` +
      `- Pending Pods: ${pods.pending ?? 'N/A'}\n` +
      `- Total Nodes: ${nodes.total ?? 'N/A'}\n` +
      `- Ready Nodes: ${nodes.ready ?? 'N/A'}\n\n` +
      `Recent warnings/errors:\n${warningText}\n\n` +
      `AI Analysis:\n${aiAnalysis}`;
  };

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: messageText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const isClusterHealthRequest = /cluster health|analyze cluster health/i.test(messageText);

      if (isClusterHealthRequest) {
        const data = await apiClient.getClusterHealth();
        const assistantMessage: Message = {
          role: 'assistant',
          content: formatClusterHealthResponse(data.health_data, data.ai_analysis),
          timestamp: new Date()
        };

        setMessages(prev => [...prev, assistantMessage]);
        return;
      }

      const conversationHistory = messages.slice(-6).map(m => ({
        role: m.role,
        content: m.content
      }));

      const data = await apiClient.chat(messageText, conversationHistory, true);
      
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        role: 'assistant',
        content: error instanceof Error
          ? `Error: ${error.message}. Please ensure the backend server is accessible.`
          : 'Sorry, I encountered an error. Please ensure the backend server is accessible.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
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
                Powered by Llama 3.2
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex gap-3 ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {message.role === 'assistant' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-white" />
                </div>
              )}
              <div
                className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                }`}
              >
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {message.content}
                </p>
                <p className="text-xs mt-2 opacity-70">
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
                  <Loader2 className="w-5 h-5 animate-spin text-gray-600 dark:text-gray-300" />
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {messages.length <= 2 ? 'Loading AI model (this may take 20-30s)...' : 'Thinking...'}
                  </span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggestions */}
        {messages.length === 1 && (
          <div className="px-6 pb-4">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              Try asking:
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
                >
                  {suggestion}
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
