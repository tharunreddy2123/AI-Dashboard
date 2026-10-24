import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import {
  AlertTriangle, CheckCircle, Clock, RefreshCw, Search,
  Filter, Sparkles, ChevronDown, ChevronUp,
  Flame, Info,
} from 'lucide-react';
import { BACKEND_URL } from '../lib/api-client';

export interface Incident {
  id: string;
  number: string;          // e.g. INC0012345
  short_description: string;
  description: string;
  severity: '1' | '2' | '3' | '4';
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  state: 'New' | 'In Progress' | 'On Hold' | 'Resolved' | 'Closed';
  category: string;
  subcategory: string;
  affected_service: string;
  namespace?: string;
  pod_name?: string;
  node_name?: string;
  assigned_to: string;
  opened_at: string;
  updated_at: string;
  resolved_at?: string;
  source: 'Cluster' | 'ServiceNow';
}

interface IncidentsProps {
  onOpenChat: (initialMessage: string) => void;
}

const SEVERITY_CONFIG = {
  '1': { label: 'Critical', color: 'text-red-400',    bg: 'bg-red-400/10 border-red-400/20',    icon: Flame },
  '2': { label: 'High',     color: 'text-orange-400', bg: 'bg-orange-400/10 border-orange-400/20', icon: AlertTriangle },
  '3': { label: 'Medium',   color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/20', icon: Info },
  '4': { label: 'Low',      color: 'text-blue-400',   bg: 'bg-blue-400/10 border-blue-400/20',   icon: Info },
};

const STATE_CONFIG: Record<string, { color: string; icon: typeof CheckCircle }> = {
  'New':         { color: 'text-red-400 bg-red-400/10 border-red-400/20',         icon: AlertTriangle },
  'In Progress': { color: 'text-blue-400 bg-blue-400/10 border-blue-400/20',      icon: Clock },
  'On Hold':     { color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20', icon: Clock },
  'Resolved':    { color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', icon: CheckCircle },
  'Closed':      { color: 'text-gray-400 bg-gray-400/10 border-gray-400/20',      icon: CheckCircle },
};

function buildRcaPrompt(inc: Incident): string {
  const parts = [
    `I have a cluster incident from the last 24 hours that needs Root Cause Analysis (RCA) and remediation steps.`,
    ``,
    `**Incident**: ${inc.number} — ${inc.short_description}`,
    `**Severity**: ${SEVERITY_CONFIG[inc.severity].label} (P${inc.severity})`,
    `**Priority**: ${inc.priority}`,
    `**State**: ${inc.state}`,
    `**Category**: ${inc.category} / ${inc.subcategory}`,
    `**Affected Service**: ${inc.affected_service}`,
  ];
  if (inc.namespace)  parts.push(`**Namespace**: ${inc.namespace}`);
  if (inc.pod_name)   parts.push(`**Pod**: ${inc.pod_name}`);
  if (inc.node_name)  parts.push(`**Node**: ${inc.node_name}`);
  parts.push(``, `**Description**: ${inc.description}`);
  parts.push(
    ``,
    `Please investigate the cluster and:`,
    `1. Identify the root cause of this incident`,
    `2. Check pod status, logs, and events related to the affected service`,
    `3. Provide a detailed RCA`,
    `4. List concrete remediation steps to resolve it`,
    `5. Suggest any preventive measures`,
  );
  return parts.join('\n');
}

export default function Incidents({ onOpenChat }: IncidentsProps) {
  const { isDark } = useTheme();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [stateFilter, setStateFilter]       = useState('all');
  const [expanded, setExpanded]   = useState<string | null>(null);

  const fetchIncidents = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/incidents`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setIncidents(data.incidents ?? []);
    } catch (e) {
      setIncidents([]);
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchIncidents(); }, []);

  const filtered = incidents.filter(inc => {
    const q = search.toLowerCase();
    const matchSearch =
      inc.number.toLowerCase().includes(q) ||
      inc.short_description.toLowerCase().includes(q) ||
      inc.affected_service.toLowerCase().includes(q) ||
      (inc.namespace ?? '').toLowerCase().includes(q);
    const matchSev   = severityFilter === 'all' || inc.severity === severityFilter;
    const matchState = stateFilter    === 'all' || inc.state    === stateFilter;
    return matchSearch && matchSev && matchState;
  });

  const counts = {
    critical:    incidents.filter(i => i.severity === '1').length,
    high:        incidents.filter(i => i.severity === '2').length,
    inProgress:  incidents.filter(i => i.state === 'In Progress').length,
    resolved:    incidents.filter(i => ['Resolved','Closed'].includes(i.state)).length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={24} className="animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Cluster Incidents
          </h1>
          <p className={`text-sm mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            {incidents.length} incidents in the last 24 hours · AI-powered RCA available
          </p>
        </div>
        <button
          onClick={fetchIncidents}
          className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-white/[0.06] text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {error && (
        <div className={`rounded-xl p-4 border text-sm ${isDark ? 'bg-yellow-500/5 border-yellow-500/20 text-yellow-300' : 'bg-yellow-50 border-yellow-200 text-yellow-700'}`}>
          ⚠️ Could not load incidents from the backend ({error}).
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Critical',    value: counts.critical,   color: 'text-red-400',     bg: 'bg-red-400/10',     icon: Flame },
          { label: 'High',        value: counts.high,        color: 'text-orange-400',  bg: 'bg-orange-400/10',  icon: AlertTriangle },
          { label: 'In Progress', value: counts.inProgress,  color: 'text-blue-400',    bg: 'bg-blue-400/10',    icon: Clock },
          { label: 'Resolved',    value: counts.resolved,    color: 'text-emerald-400', bg: 'bg-emerald-400/10', icon: CheckCircle },
        ].map((item, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className={`rounded-xl p-4 border ${isDark ? 'bg-[#0d1220] border-white/[0.06]' : 'bg-white border-gray-200 shadow-sm'}`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${item.bg}`}>
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
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search incidents..."
            className={`bg-transparent text-sm outline-none w-48 ${isDark ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'}`}
          />
        </div>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isDark ? 'bg-white/[0.04]' : 'bg-gray-100'}`}>
          <Filter size={14} className={isDark ? 'text-gray-500' : 'text-gray-400'} />
          <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}
            className={`bg-transparent text-sm outline-none ${isDark ? 'text-gray-300' : 'text-gray-700'}`}
          >
            <option value="all">All Severities</option>
            <option value="1">Critical</option>
            <option value="2">High</option>
            <option value="3">Medium</option>
            <option value="4">Low</option>
          </select>
        </div>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isDark ? 'bg-white/[0.04]' : 'bg-gray-100'}`}>
          <Filter size={14} className={isDark ? 'text-gray-500' : 'text-gray-400'} />
          <select value={stateFilter} onChange={e => setStateFilter(e.target.value)}
            className={`bg-transparent text-sm outline-none ${isDark ? 'text-gray-300' : 'text-gray-700'}`}
          >
            <option value="all">All States</option>
            <option value="New">New</option>
            <option value="In Progress">In Progress</option>
            <option value="On Hold">On Hold</option>
            <option value="Resolved">Resolved</option>
            <option value="Closed">Closed</option>
          </select>
        </div>
        <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{filtered.length} incidents</span>
      </div>

      {/* Incident list */}
      <div className="space-y-3">
        {filtered.map((inc, i) => {
          const sev   = SEVERITY_CONFIG[inc.severity];
          const state = STATE_CONFIG[inc.state] ?? STATE_CONFIG['New'];
          const isOpen = expanded === inc.id;

          return (
            <motion.div key={inc.id}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
              className={`rounded-xl border transition-colors ${
                inc.severity === '1'
                  ? isDark ? 'bg-red-500/5 border-red-500/20' : 'bg-red-50 border-red-200'
                  : inc.severity === '2'
                    ? isDark ? 'bg-orange-500/5 border-orange-500/20' : 'bg-orange-50 border-orange-200'
                    : isDark ? 'bg-[#0d1220] border-white/[0.06]' : 'bg-white border-gray-200 shadow-sm'
              }`}
            >
              {/* Row summary */}
              <div className="flex items-start gap-3 p-4">
                <div className={`p-1.5 rounded-lg border ${sev.bg} flex-shrink-0 mt-0.5`}>
                  <sev.icon size={15} className={sev.color} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-xs font-mono font-semibold ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{inc.number}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${sev.bg} ${sev.color}`}>{sev.label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${state.color}`}>{inc.state}</span>
                  </div>
                  <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{inc.short_description}</p>
                  <div className="flex items-center gap-4 mt-1.5 text-[11px] flex-wrap">
                    <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>Service: <span className={isDark ? 'text-gray-300' : 'text-gray-600'}>{inc.affected_service}</span></span>
                    {inc.namespace && <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>NS: <span className={`font-mono ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{inc.namespace}</span></span>}
                    <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>Assigned: {inc.assigned_to}</span>
                    <span className={isDark ? 'text-gray-600' : 'text-gray-300'}>{new Date(inc.opened_at).toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* AI RCA button */}
                  <button
                    onClick={() => onOpenChat(buildRcaPrompt(inc))}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white transition-all"
                    title="Investigate with AI — get RCA & remediation"
                  >
                    <Sparkles size={13} />
                    <span>Investigate</span>
                  </button>
                  <button
                    onClick={() => setExpanded(isOpen ? null : inc.id)}
                    className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-white/[0.06] text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                  >
                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div className={`px-4 pb-4 pt-0 border-t ${isDark ? 'border-white/[0.06]' : 'border-gray-100'}`}>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Description</p>
                      <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{inc.description}</p>
                    </div>
                    <div className="space-y-2">
                      <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Details</p>
                      {([
                        ['Category',    `${inc.category} / ${inc.subcategory}`],
                        ['Priority',    inc.priority],
                        inc.pod_name  ? ['Pod',   inc.pod_name]  : null,
                        inc.node_name ? ['Node',  inc.node_name] : null,
                        ['Opened',      new Date(inc.opened_at).toLocaleString()],
                        ['Updated',     new Date(inc.updated_at).toLocaleString()],
                        inc.resolved_at ? ['Resolved', new Date(inc.resolved_at).toLocaleString()] : null,
                      ].filter(Boolean) as [string, string][]).map(([k, v], j) => (
                        <div key={j} className="flex items-center gap-2 text-xs">
                          <span className={`w-20 flex-shrink-0 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{k}</span>
                          <span className={`font-mono ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => onOpenChat(buildRcaPrompt(inc))}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white transition-all"
                    >
                      <Sparkles size={14} />
                      Investigate with AI — get RCA &amp; remediation
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}

        {filtered.length === 0 && (
          <div className={`rounded-xl p-12 border text-center ${isDark ? 'bg-[#0d1220] border-white/[0.06]' : 'bg-white border-gray-200'}`}>
            <CheckCircle size={32} className="mx-auto mb-3 text-emerald-400" />
            <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>
              {incidents.length === 0 ? 'No incidents in the last 24 hours' : 'No incidents match your filters'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
