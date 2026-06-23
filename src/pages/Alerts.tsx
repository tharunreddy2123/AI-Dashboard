import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { getEvents, type OCEvent } from '../lib/openshift-direct';
import { Bell, AlertTriangle, CheckCircle, XCircle, Search, Filter, Shield, RefreshCw } from 'lucide-react';

export default function Alerts() {
  const { isDark } = useTheme();
  const [events, setEvents] = useState<OCEvent[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const warningEvents = events.filter(e => e.type === 'Warning');
  const normalEvents = events.filter(e => e.type === 'Normal');

  const filtered = events.filter(e => {
    const matchSearch = e.message.toLowerCase().includes(search.toLowerCase()) || e.reason.toLowerCase().includes(search.toLowerCase()) || e.involvedObject.name.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'all' || e.type === typeFilter;
    return matchSearch && matchType;
  });

  const severityIcon = (type: string) => {
    switch (type) {
      case 'Warning': return <XCircle size={16} className="text-red-400" />;
      default: return <Bell size={16} className="text-blue-400" />;
    }
  };

  const severityBg = (type: string) => {
    switch (type) {
      case 'Warning': return 'text-red-400 bg-red-400/10 border-red-400/20';
      default: return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
    }
  };

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
          <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Alerts & Events Center</h1>
          <p className={`text-sm mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            {events.length} events from OpenShift cluster
          </p>
        </div>
        <button onClick={fetchData} className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-white/[0.06] text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Warning Events', value: warningEvents.length, icon: AlertTriangle, color: 'text-red-400' },
          { label: 'Normal Events', value: normalEvents.length, icon: CheckCircle, color: 'text-emerald-400' },
          { label: 'Total Events', value: events.length, icon: Shield, color: 'text-blue-400' },
          { label: 'Unique Reasons', value: new Set(events.map(e => e.reason)).size, icon: XCircle, color: 'text-orange-400' },
        ].map((item, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className={`rounded-xl p-4 border ${isDark ? 'bg-[#0d1220] border-white/[0.06]' : 'bg-white border-gray-200 shadow-sm'}`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${item.color.replace('text-', 'bg-').replace('-400', '-400/10')}`}>
                <item.icon size={18} className={item.color} />
              </div>
              <div>
                <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{item.label}</p>
                <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

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
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className={`bg-transparent text-sm outline-none ${isDark ? 'text-gray-300' : 'text-gray-700'}`}
          >
            <option value="all">All Types</option>
            <option value="Warning">Warning</option>
            <option value="Normal">Normal</option>
          </select>
        </div>
        <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{filtered.length} events</span>
      </div>

      {/* Event list */}
      <div className="space-y-3">
        {filtered.slice(0, 50).map((event, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
            className={`rounded-xl p-4 border transition-colors ${
              event.type === 'Warning'
                ? isDark ? 'bg-red-500/5 border-red-500/20' : 'bg-red-50 border-red-200'
                : isDark ? 'bg-[#0d1220] border-white/[0.06]' : 'bg-white border-gray-200 shadow-sm'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`p-1.5 rounded-lg ${severityBg(event.type).split(' ').slice(1).join(' ')}`}>
                {severityIcon(event.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{event.reason}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${severityBg(event.type)}`}>
                    {event.type}
                  </span>
                </div>
                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{event.message}</p>
                <div className="flex items-center gap-4 mt-2 text-[10px]">
                  <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>Source: {event.source.component}</span>
                  <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>NS: {event.involvedObject.namespace}</span>
                  <span className={`font-mono ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{event.involvedObject.kind}: {event.involvedObject.name}</span>
                  <span className={isDark ? 'text-gray-600' : 'text-gray-300'}>{new Date(event.lastTimestamp).toLocaleString()}</span>
                  <span className={isDark ? 'text-gray-600' : 'text-gray-300'}>Count: {event.count}</span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
