import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { getNamespaces, getPods, type OCNamespace, type OCPod } from '../lib/openshift-direct';
import { Search, ChevronDown, ChevronRight, Boxes, Container, Server, Activity, RefreshCw } from 'lucide-react';

export default function Namespaces() {
  const { isDark } = useTheme();
  const [namespaces, setNamespaces] = useState<OCNamespace[]>([]);
  const [pods, setPods] = useState<OCPod[]>([]);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ns, pd] = await Promise.all([getNamespaces(), getPods()]);
      setNamespaces(ns);
      setPods(pd);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = namespaces.filter(ns =>
    ns.metadata.name.toLowerCase().includes(search.toLowerCase())
  );

  const getNsPodCount = (nsName: string) => pods.filter(p => p.metadata.namespace === nsName).length;
  const getNsRunningPods = (nsName: string) => pods.filter(p => p.metadata.namespace === nsName && p.status.phase === 'Running').length;
  const getNsFailedPods = (nsName: string) => pods.filter(p => p.metadata.namespace === nsName && p.status.phase !== 'Running' && p.status.phase !== 'Succeeded').length;
  const getNsRestarts = (nsName: string) => pods.filter(p => p.metadata.namespace === nsName).reduce((sum, p) => sum + (p.status.containerStatuses?.reduce((s, cs) => s + cs.restartCount, 0) || 0), 0);

  const getNsStatus = (nsName: string): 'healthy' | 'warning' | 'critical' => {
    const failed = getNsFailedPods(nsName);
    const restarts = getNsRestarts(nsName);
    if (failed > 2 || restarts > 20) return 'critical';
    if (failed > 0 || restarts > 5) return 'warning';
    return 'healthy';
  };

  const statusColor = (status: string) => {
    if (status === 'healthy') return 'text-emerald-400 bg-emerald-400/10';
    if (status === 'warning') return 'text-yellow-400 bg-yellow-400/10';
    return 'text-red-400 bg-red-400/10';
  };

  const healthBarColor = (score: number) => {
    if (score >= 90) return 'bg-emerald-400';
    if (score >= 70) return 'bg-yellow-400';
    return 'bg-red-400';
  };

  const getNsHealthScore = (nsName: string) => {
    const total = getNsPodCount(nsName);
    if (total === 0) return 100;
    const running = getNsRunningPods(nsName);
    return Math.round((running / total) * 100);
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
          <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Project Monitoring</h1>
          <p className={`text-sm mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            {namespaces.length} projects from OpenShift cluster
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isDark ? 'bg-white/[0.04]' : 'bg-gray-100'}`}>
            <Search size={14} className={isDark ? 'text-gray-500' : 'text-gray-400'} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search namespaces..."
              className={`bg-transparent text-sm outline-none ${isDark ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'}`}
            />
          </div>
          <button onClick={fetchData} className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-white/[0.06] text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Projects', value: namespaces.length, icon: Boxes, color: 'text-blue-400' },
          { label: 'Healthy', value: namespaces.filter(n => getNsStatus(n.metadata.name) === 'healthy').length, icon: Activity, color: 'text-emerald-400' },
          { label: 'Warning', value: namespaces.filter(n => getNsStatus(n.metadata.name) === 'warning').length, icon: Container, color: 'text-yellow-400' },
          { label: 'Critical', value: namespaces.filter(n => getNsStatus(n.metadata.name) === 'critical').length, icon: Server, color: 'text-red-400' },
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
                <p className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{item.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Namespace list */}
      <div className="space-y-3">
        {filtered.map((ns, i) => {
          const name = ns.metadata.name;
          const status = getNsStatus(name);
          const healthScore = getNsHealthScore(name);
          const podCount = getNsPodCount(name);
          const runningCount = getNsRunningPods(name);
          const failedCount = getNsFailedPods(name);
          const restartCount = getNsRestarts(name);

          return (
            <motion.div key={name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className={`rounded-xl border overflow-hidden transition-colors ${isDark ? 'bg-[#0d1220] border-white/[0.06]' : 'bg-white border-gray-200 shadow-sm'}`}
            >
              <button onClick={() => setExpanded(expanded === name ? null : name)} className="w-full px-5 py-4 flex items-center gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {expanded === name ? <ChevronDown size={16} className={isDark ? 'text-gray-500' : 'text-gray-400'} /> : <ChevronRight size={16} className={isDark ? 'text-gray-500' : 'text-gray-400'} />}
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-400/20 flex items-center justify-center">
                    <Boxes size={16} className="text-blue-400" />
                  </div>
                  <div className="text-left min-w-0">
                    <p className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{name}</p>
                    <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{ns.status.phase}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-center"><p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Pods</p><p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{podCount}</p></div>
                  <div className="text-center"><p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Running</p><p className="text-sm font-semibold text-emerald-400">{runningCount}</p></div>
                  <div className="text-center"><p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Failed</p><p className={`text-sm font-semibold ${failedCount > 0 ? 'text-red-400' : isDark ? 'text-white' : 'text-gray-900'}`}>{failedCount}</p></div>
                  <div className="text-center min-w-[60px]">
                    <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Health</p>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${healthBarColor(healthScore)}`} />
                      <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{healthScore}%</span>
                    </div>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColor(status)}`}>{status}</span>
                </div>
              </button>

              {expanded === name && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  className={`px-5 pb-5 border-t ${isDark ? 'border-white/[0.06]' : 'border-gray-100'}`}
                >
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                    {[
                      { label: 'Total Pods', value: podCount },
                      { label: 'Running', value: runningCount },
                      { label: 'Failed', value: failedCount },
                      { label: 'Restarts', value: restartCount },
                    ].map((stat, j) => (
                      <div key={j} className={`p-3 rounded-lg ${isDark ? 'bg-white/[0.03]' : 'bg-gray-50'}`}>
                        <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{stat.label}</p>
                        <p className={`text-lg font-bold mt-0.5 ${isDark ? 'text-white' : 'text-gray-900'}`}>{stat.value}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
