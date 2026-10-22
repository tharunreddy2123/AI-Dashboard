import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Sparkles, Activity, Server, Box, AlertTriangle, Layers } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { BACKEND_URL, fetchWithRetry } from '../lib/api-client';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  actionPerformed?: string;
  actionSuccess?: boolean;
}

type AIProvider = 'watsonx' | 'ica';

const WELCOME_MESSAGE =
  "Hello! I'm your OpenShift AI assistant.\n\nI am connected to your live cluster and can:\n\n• Show pods, nodes, deployments, events and namespaces\n• Diagnose CrashLoopBackOff, OOMKilled, Pending pods\n• Analyze cluster health with AI insights\n• Explain warning events and suggest fixes\n• Provide RCA and remediation for ServiceNow incidents\n\nPick a quick action below or type your question.";

const SUGGESTIONS = [
  { icon: Activity,      label: 'Cluster health',    query: 'Analyze cluster health and show all issues' },
  { icon: Box,           label: 'Unhealthy pods',     query: 'Show all unhealthy, failed and pending pods' },
  { icon: Server,        label: 'Node status',        query: 'Show all nodes and their status' },
  { icon: Layers,        label: 'Deployments',        query: 'Show all deployments and their replica status' },
  { icon: AlertTriangle, label: 'Warning events',     query: 'Show recent warning and error events' },
  { icon: Box,           label: 'Create nginx pod',   query: 'Create nginx pod in tharunreddy-dev' },
  { icon: Layers,        label: 'Namespaces',         query: 'List all namespaces and projects' },
  { icon: AlertTriangle, label: 'Failed deployments', query: 'Show failed or degraded deployments' },
];

function MessageContent({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="text-sm leading-relaxed space-y-1">
      {lines.map((line, i) => {
        const parts = line.split(/(`[^`]+`)/g);
        const rendered = parts.map((part, j) =>
          part.startsWith('`') && part.endsWith('`')
            ? <code key={j} className="bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded text-xs font-mono">{part.slice(1, -1)}</code>
            : <span key={j}>{part}</span>
        );
        if (/^#{1,3}\s/.test(line))
          return <p key={i} className="font-semibold text-blue-600 dark:text-blue-400 mt-2">{line.replace(/^#{1,3}\s/, '')}</p>;
        if (/^[-•*]\s/.test(line))
          return <p key={i} className="pl-3">• {line.replace(/^[-•*]\s/, '')}</p>;
        if (/^\d+\.\s/.test(line))
          return <p key={i} className="pl-3">{line}</p>;
        if (line.trim() === '') return <br key={i} />;
        return <p key={i}>{rendered}</p>;
      })}
    </div>
  );
}

interface AIAssistantProps {
  initialMessage?: string;
}

export default function AIAssistant({ initialMessage }: AIAssistantProps) {
  const { isDark } = useTheme();
  const [provider, setProvider] = useState<AIProvider>('watsonx');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: WELCOME_MESSAGE, timestamp: new Date() },
  ]);
  const [input, setInput]       = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLInputElement>(null);
  const firedInitial   = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-fire if opened from Incidents page with a pre-built RCA prompt
  useEffect(() => {
    if (initialMessage && !firedInitial.current) {
      firedInitial.current = true;
      setMessages([{ role: 'assistant', content: WELCOME_MESSAGE, timestamp: new Date() }]);
      sendMessage(initialMessage);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: Message = { role: 'user', content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    try {
      const history = messages.slice(-8).map(m => ({ role: m.role, content: m.content }));
      const endpoint = provider === 'ica' ? '/api/chat/ica' : '/api/chat';
      const res = await fetchWithRetry(`${BACKEND_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, conversation_history: history, include_context: true }),
      }, { timeout: 120000 });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        actionPerformed: data.action_performed ?? undefined,
        actionSuccess:   data.action_success   ?? undefined,
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: err instanceof Error ? `Error: ${err.message}` : 'Sorry, I encountered an error. Please check the backend is running.',
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`flex flex-col h-[calc(100vh-56px)] -m-6 ${isDark ? 'bg-[#060a14]' : 'bg-gray-50'}`}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className={`flex items-center justify-between px-6 py-3 border-b flex-shrink-0 ${
        isDark ? 'bg-[#0a0e1a] border-white/[0.06]' : 'bg-white border-gray-200'
      }`}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className={`text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              OpenShift AI Assistant
            </h1>
            <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              {provider === 'ica' ? 'Powered by ICA' : 'Powered by IBM watsonx.ai'}
            </p>
          </div>
        </div>

        {/* Provider toggle */}
        <div className={`flex items-center gap-1 rounded-lg p-1 ${isDark ? 'bg-white/[0.06]' : 'bg-gray-100'}`}>
          {(['watsonx', 'ica'] as AIProvider[]).map(p => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                provider === p
                  ? isDark
                    ? 'bg-white/10 text-white'
                    : 'bg-white text-blue-600 shadow-sm'
                  : isDark
                    ? 'text-gray-400 hover:text-gray-200'
                    : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p === 'watsonx' ? 'watsonx' : 'ICA'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Messages ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}
            <div className={`max-w-[70%] rounded-2xl px-4 py-3 ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white text-sm'
                : isDark
                  ? 'bg-white/[0.06] text-white'
                  : 'bg-white border border-gray-200 text-gray-900'
            }`}>
              {msg.actionPerformed && (
                <div className={`flex items-center gap-2 text-xs font-medium px-2 py-1 rounded-lg mb-2 ${
                  msg.actionSuccess
                    ? 'bg-green-500/10 text-green-400'
                    : 'bg-red-500/10 text-red-400'
                }`}>
                  <span>{msg.actionSuccess ? '✅' : '❌'}</span>
                  <span>{msg.actionPerformed}</span>
                </div>
              )}
              {msg.role === 'assistant'
                ? <MessageContent content={msg.content} />
                : <p className="text-sm leading-relaxed">{msg.content}</p>
              }
              <p className="text-xs mt-2 opacity-50">{msg.timestamp.toLocaleTimeString()}</p>
            </div>
            {msg.role === 'user' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 justify-start">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className={`rounded-2xl px-4 py-3 ${isDark ? 'bg-white/[0.06]' : 'bg-white border border-gray-200'}`}>
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Fetching live cluster data…</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Quick actions (shown only before first user message) ────────────── */}
      {messages.length === 1 && (
        <div className={`px-6 pb-3 flex-shrink-0`}>
          <p className={`text-xs font-medium uppercase tracking-wide mb-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            Quick actions
          </p>
          <div className="grid grid-cols-4 gap-2">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                onClick={() => sendMessage(s.query)}
                className={`flex items-center gap-2 px-3 py-2 text-xs rounded-xl border transition-colors text-left ${
                  isDark
                    ? 'bg-white/[0.04] border-white/[0.06] text-gray-300 hover:bg-blue-500/10 hover:border-blue-500/30 hover:text-blue-300'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700'
                }`}
              >
                <s.icon className="w-3.5 h-3.5 flex-shrink-0 text-blue-500" />
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Input bar ───────────────────────────────────────────────────────── */}
      <div className={`px-6 py-4 border-t flex-shrink-0 ${
        isDark ? 'bg-[#0a0e1a] border-white/[0.06]' : 'bg-white border-gray-200'
      }`}>
        <form onSubmit={e => { e.preventDefault(); sendMessage(input); }} className="flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask me anything about your OpenShift cluster…"
            disabled={isLoading}
            className={`flex-1 px-4 py-3 rounded-xl text-sm border outline-none transition-all disabled:opacity-50 ${
              isDark
                ? 'bg-white/[0.06] border-white/[0.08] text-white placeholder-gray-500 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30'
                : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-200'
            }`}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-5 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
