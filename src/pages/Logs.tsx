import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { getEvents, type OCEvent } from '../lib/openshift-direct';
import { Search, Download, Pause, Play, Filter, FileText, AlertTriangle, RefreshCw } from 'lucide-react';

export default function Logs() {
  const { isDark } = useTheme();
  const [events, setEvents] = useState<OCEvent[]>([]);
  const [search, setSearch] = useState('');
  const [namespaceFilter, setNamespaceFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const ev = await getEvents();
      setEvents(ev.sort((a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = events.filter(e => {
    const matchSearch = e.message.toLowerCase().includes(search.toLowerCase()) || e.involvedObject.name.toLowerCase().includes(search.toLowerCase());
    const matchNs = namespaceFilter === 'all' || e.involvedObject.namespace === namespaceFilter;
    const matchType = typeFilter === 'all' || e.type === typeFilter;
    return matchSearch && matchNs && matchType;
  });

  useEffect(() => {
    if (!paused) logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [filtered, paused]);

  const levelColor = (type: string) => {
    switch (type) {
      case 'Warning': return 'text-red-400 bg-red-400/10';
      case 'Normal': return 'text-blue-400 bg-blue-400/10';
      default: return 'text-gray-400 bg-gray-400/10';
    }
  };

  const namespaces = [...new Set(events.map(e => e.involvedObject.namespace).filter(Boolean))];

  const handleExport = () => {
    const text = filtered.map(e => `[${e.lastTimestamp}] [${e.type}] [${e.involvedObject.namespace}/${e.involvedObject.name}] ${e.reason}: ${e.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'openshift-events.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const warningCount = events.filter(e => e.type === 'Warning').length;
  const normalCount = events.filter(e => e.type === 'Normal').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={24} className="animate-spin text-blue-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className={`rounded-xl p-8 border max-w-md text-center ${isDark ? 'bg-[#0d1220] border-red-500/20' : 'bg-white border-red-200'}`}>
          <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{error}</p>
          <button onClick={fetchData} className="mt-4 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Events & Troubleshooting</h1>
          <p className={`text-sm mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            {events.length} events from OpenShift cluster
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPaused(!paused)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${paused ? 'bg-emerald-400/10 text-emerald-400' : isDark ? 'bg-white/[0.04] text-gray-400 hover:bg-white/[0.08]' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
          >
            {paused ? <Play size={12} /> : <Pause size={12} />}
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button onClick={handleExport}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${isDark ? 'bg-white/[0.04] text-gray-400 hover:bg-white/[0.08]' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
          >
            <Download size={12} /> Export
          </button>
          <button onClick={fetchData} className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-white/[0.06] text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* AI Summary */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className={`rounded-xl p-5 border ${isDark ? 'bg-gradient-to-r from-blue-500/5 to-cyan-400/5 border-blue-500/10' : 'bg-blue-50 border-blue-100'}`}
      >
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={16} className="text-blue-400" />
          <h3 className={`text-sm font-semibold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>AI Event Analysis</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className={`p-3 rounded-lg ${isDark ? 'bg-white/[0.03]' : 'bg-white'}`}>
            <p className={`text-xs font-medium ${isDark ? 'text-red-400' : 'text-red-500'}`}>Warning Events</p>
            <p className={`text-sm mt-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{warningCount} warning events detected in the cluster</p>
          </div>
          <div className={`p-3 rounded-lg ${isDark ? 'bg-white/[0.03]' : 'bg-white'}`}>
            <p className={`text-xs font-medium ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>Normal Events</p>
            <p className={`text-sm mt-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{normalCount} normal informational events</p>
          </div>
          <div className={`p-3 rounded-lg ${isDark ? 'bg-white/[0.03]' : 'bg-white'}`}>
            <p className={`text-xs font-medium ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>Recommendation</p>
            <p className={`text-sm mt-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Review warning events for potential issues requiring attention</p>
          </div>
        </div>
      </motion.div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isDark ? 'bg-white/[0.04]' : 'bg-gray-100'}`}>
          <Search size={14} className={isDark ? 'text-gray-500' : 'text-gray-400'} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search events..."
            className={`bg-transparent text-sm outline-none w-48 ${isDark ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'}`}
          />
        </div>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isDark ? 'bg-white/[0.04]' : 'bg-gray-100'}`}>
          <Filter size={14} className={isDark ? 'text-gray-500' : 'text-gray-400'} />
          <select value={namespaceFilter} onChange={e => setNamespaceFilter(e.target.value)}
            className={`bg-transparent text-sm outline-none ${isDark ? 'text-gray-300' : 'text-gray-700'}`}
          >
            <option value="all">All Namespaces</option>
            {namespaces.map(ns => <option key={ns} value={ns}>{ns}</option>)}
          </select>
        </div>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isDark ? 'bg-white/[0.04]' : 'bg-gray-100'}`}>
          <Filter size={14} className={isDark ? 'text-gray-500' : 'text-gray-400'} />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className={`bg-transparent text-sm outline-none ${isDark ? 'text-gray-300' : 'text-gray-700'}`}
          >
            <option value="all">All Types</option>
            <option value="Warning">Warning</option>
            <option value="Normal">Normal</option>
          </select>
        </div>
        <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{filtered.length} entries</span>
      </div>

      {/* Event viewer */}
      <div className={`rounded-xl border overflow-hidden ${isDark ? 'bg-[#0a0e18] border-white/[0.06]' : 'bg-gray-950 border-gray-200'}`}>
        <div className={`flex items-center justify-between px-4 py-2 border-b ${isDark ? 'border-white/[0.06]' : 'border-gray-800'}`}>
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-gray-400" />
            <span className="text-xs text-gray-400">Event Stream</span>
            <div className={`w-1.5 h-1.5 rounded-full ${paused ? 'bg-yellow-400' : 'bg-emerald-400 animate-pulse'}`} />
          </div>
          <span className="text-xs text-gray-500">{filtered.length} events</span>
        </div>
        <div className="h-[500px] overflow-y-auto p-4 font-mono text-xs space-y-0.5">
          {filtered.map((event, i) => (
            <div key={i}
              className={`flex gap-3 py-0.5 hover:bg-white/[0.02] rounded px-1 ${event.type === 'Warning' ? 'bg-red-500/5' : ''}`}
            >
              <span className="text-gray-600 flex-shrink-0">{new Date(event.lastTimestamp).toLocaleTimeString()}</span>
              <span className={`px-1.5 py-0 rounded text-[10px] font-bold flex-shrink-0 ${levelColor(event.type)}`}>
                {event.type.padEnd(7)}
              </span>
              <span className="text-cyan-400/60 flex-shrink-0">{event.involvedObject.namespace}/{event.involvedObject.name.slice(0, 20)}</span>
              <span className={`font-medium ${event.type === 'Warning' ? 'text-red-300' : 'text-gray-400'}`}>{event.reason}:</span>
              <span className="text-gray-300 truncate">{event.message}</span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}
