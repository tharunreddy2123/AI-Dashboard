import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { getPods, type OCPod } from '../lib/openshift-direct';
import { getPodAge, getPodHealthStatus } from '../lib/openshift-direct';
import { Search, Filter, Container, AlertTriangle, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react';

export default function Pods() {
  const { isDark } = useTheme();
  const [pods, setPods] = useState<OCPod[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const pd = await getPods();
      setPods(pd);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const getPodStatus = (pod: OCPod): string => {
    const containerStatuses = pod.status.containerStatuses || [];
    if (containerStatuses.some(cs => { const w = cs.state as { waiting?: { reason: string } }; return w?.waiting?.reason === 'CrashLoopBackOff'; })) return 'CrashLoopBackOff';
    if (containerStatuses.some(cs => { const t = cs.state as { terminated?: { reason: string } }; return t?.terminated?.reason === 'OOMKilled'; })) return 'OOMKilled';
    if (containerStatuses.some(cs => { const w = cs.state as { waiting?: { reason: string } }; return w?.waiting?.reason === 'ImagePullBackOff'; })) return 'ImagePullBackOff';
    if (containerStatuses.some(cs => { const w = cs.state as { waiting?: { reason: string } }; return w?.waiting?.reason === 'ContainerCreating'; })) return 'ContainerCreating';
    return pod.status.phase;
  };

  const getRestartCount = (pod: OCPod): number => {
    return pod.status.containerStatuses?.reduce((sum, cs) => sum + cs.restartCount, 0) || 0;
  };

  const filtered = pods.filter(p => {
    const name = p.metadata.name.toLowerCase();
    const ns = p.metadata.namespace.toLowerCase();
    const matchSearch = name.includes(search.toLowerCase()) || ns.includes(search.toLowerCase());
    const status = getPodStatus(p);
    const matchStatus = statusFilter === 'all' || status === statusFilter;
    return matchSearch && matchStatus;
  });

  const statusIcon = (status: string) => {
    switch (status) {
      case 'Running': return <CheckCircle size={14} className="text-emerald-400" />;
      case 'CrashLoopBackOff': return <XCircle size={14} className="text-red-400" />;
      case 'OOMKilled': return <AlertTriangle size={14} className="text-red-400" />;
      case 'ImagePullBackOff': return <XCircle size={14} className="text-orange-400" />;
      case 'Pending': return <Clock size={14} className="text-blue-400" />;
      case 'Succeeded': return <CheckCircle size={14} className="text-gray-400" />;
      default: return <Container size={14} className="text-gray-400" />;
    }
  };

  const statusBg = (status: string) => {
    switch (status) {
      case 'Running': return 'text-emerald-400 bg-emerald-400/10';
      case 'CrashLoopBackOff': return 'text-red-400 bg-red-400/10';
      case 'OOMKilled': return 'text-red-400 bg-red-400/10';
      case 'ImagePullBackOff': return 'text-orange-400 bg-orange-400/10';
      case 'Pending': return 'text-blue-400 bg-blue-400/10';
      case 'Succeeded': return 'text-gray-400 bg-gray-400/10';
      default: return 'text-gray-400 bg-gray-400/10';
    }
  };

  const healthColor = (health: string) => {
    if (health === 'healthy') return 'text-emerald-400';
    if (health === 'warning') return 'text-yellow-400';
    return 'text-red-400';
  };

  const uniqueStatuses = [...new Set(pods.map(p => getPodStatus(p)))];
  const runningCount = pods.filter(p => getPodStatus(p) === 'Running').length;
  const crashLoopCount = pods.filter(p => getPodStatus(p) === 'CrashLoopBackOff').length;
  const oomCount = pods.filter(p => getPodStatus(p) === 'OOMKilled').length;
  const pendingCount = pods.filter(p => getPodStatus(p) === 'Pending').length;
  const highRestartCount = pods.filter(p => getRestartCount(p) > 5).length;

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
          <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Pod Monitoring</h1>
          <p className={`text-sm mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            {pods.length} pods from OpenShift cluster
          </p>
        </div>
        <button onClick={fetchData} className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-white/[0.06] text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: 'Total', value: pods.length, color: 'text-blue-400' },
          { label: 'Running', value: runningCount, color: 'text-emerald-400' },
          { label: 'CrashLoop', value: crashLoopCount, color: 'text-red-400' },
          { label: 'OOMKilled', value: oomCount, color: 'text-red-400' },
          { label: 'Pending', value: pendingCount, color: 'text-blue-400' },
          { label: 'High Restart', value: highRestartCount, color: 'text-yellow-400' },
        ].map((item, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className={`rounded-xl p-3 border text-center ${isDark ? 'bg-[#0d1220] border-white/[0.06]' : 'bg-white border-gray-200 shadow-sm'}`}
          >
            <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{item.label}</p>
            <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isDark ? 'bg-white/[0.04]' : 'bg-gray-100'}`}>
          <Search size={14} className={isDark ? 'text-gray-500' : 'text-gray-400'} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search pods..."
            className={`bg-transparent text-sm outline-none w-48 ${isDark ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'}`}
          />
        </div>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isDark ? 'bg-white/[0.04]' : 'bg-gray-100'}`}>
          <Filter size={14} className={isDark ? 'text-gray-500' : 'text-gray-400'} />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className={`bg-transparent text-sm outline-none ${isDark ? 'text-gray-300' : 'text-gray-700'}`}
          >
            <option value="all">All Status</option>
            {uniqueStatuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          Showing {filtered.length} of {pods.length} pods
        </span>
      </div>

      {/* Pod table */}
      <div className={`rounded-xl border overflow-hidden ${isDark ? 'bg-[#0d1220] border-white/[0.06]' : 'bg-white border-gray-200 shadow-sm'}`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className={`border-b ${isDark ? 'border-white/[0.06]' : 'border-gray-200'}`}>
                {['Pod', 'Namespace', 'Status', 'Restarts', 'Node', 'Age', 'Health'].map(h => (
                  <th key={h} className={`px-4 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((pod, i) => {
                const status = getPodStatus(pod);
                const restarts = getRestartCount(pod);
                const health = getPodHealthStatus(pod);
                const age = getPodAge(pod.metadata.creationTimestamp);

                return (
                  <motion.tr key={pod.metadata.uid || i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.01 }}
                    className={`border-b transition-colors ${isDark ? 'border-white/[0.03] hover:bg-white/[0.02]' : 'border-gray-100 hover:bg-gray-50'}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {statusIcon(status)}
                        <span className={`text-sm font-medium truncate max-w-[200px] ${isDark ? 'text-white' : 'text-gray-900'}`}>{pod.metadata.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${isDark ? 'bg-white/[0.06] text-gray-300' : 'bg-gray-100 text-gray-600'}`}>{pod.metadata.namespace}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBg(status)}`}>{status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-medium ${restarts > 5 ? 'text-red-400' : restarts > 0 ? 'text-yellow-400' : 'text-emerald-400'}`}>{restarts}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{pod.spec.nodeName || '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{age}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium capitalize ${healthColor(health)}`}>{health}</span>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
