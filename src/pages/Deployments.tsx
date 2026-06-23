import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { getDeployments, type OCDeployment } from '../lib/openshift-direct';
import { Search, Rocket, CheckCircle, XCircle, Clock, AlertTriangle, RefreshCw } from 'lucide-react';

export default function Deployments() {
  const { isDark } = useTheme();
  const [deployments, setDeployments] = useState<OCDeployment[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const dep = await getDeployments();
      setDeployments(dep);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const getRolloutStatus = (dep: OCDeployment): string => {
    if (dep.status.unavailableReplicas > 0) return 'Failed';
    if (dep.status.updatedReplicas === dep.status.replicas && dep.status.availableReplicas === dep.spec.replicas) return 'Completed';
    return 'Progressing';
  };

  const filtered = deployments.filter(d => {
    const matchSearch = d.metadata.name.toLowerCase().includes(search.toLowerCase()) || d.metadata.namespace.toLowerCase().includes(search.toLowerCase());
    const status = getRolloutStatus(d);
    const matchFilter = filter === 'all' || status === filter;
    return matchSearch && matchFilter;
  });

  const rolloutIcon = (status: string) => {
    switch (status) {
      case 'Completed': return <CheckCircle size={16} className="text-emerald-400" />;
      case 'Failed': return <XCircle size={16} className="text-red-400" />;
      case 'Progressing': return <Clock size={16} className="text-blue-400 animate-pulse" />;
      default: return <AlertTriangle size={16} className="text-yellow-400" />;
    }
  };

  const rolloutBg = (status: string) => {
    switch (status) {
      case 'Completed': return 'text-emerald-400 bg-emerald-400/10';
      case 'Failed': return 'text-red-400 bg-red-400/10';
      case 'Progressing': return 'text-blue-400 bg-blue-400/10';
      default: return 'text-yellow-400 bg-yellow-400/10';
    }
  };

  const completedCount = deployments.filter(d => getRolloutStatus(d) === 'Completed').length;
  const failedCount = deployments.filter(d => getRolloutStatus(d) === 'Failed').length;
  const progressingCount = deployments.filter(d => getRolloutStatus(d) === 'Progressing').length;

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
          <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Deployment Monitoring</h1>
          <p className={`text-sm mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            {deployments.length} deployments from OpenShift cluster
          </p>
        </div>
        <button onClick={fetchData} className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-white/[0.06] text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Deployments', value: deployments.length, color: 'text-blue-400' },
          { label: 'Completed', value: completedCount, color: 'text-emerald-400' },
          { label: 'Failed', value: failedCount, color: 'text-red-400' },
          { label: 'Progressing', value: progressingCount, color: 'text-blue-400' },
        ].map((item, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className={`rounded-xl p-4 border ${isDark ? 'bg-[#0d1220] border-white/[0.06]' : 'bg-white border-gray-200 shadow-sm'}`}
          >
            <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{item.label}</p>
            <p className={`text-xl font-bold mt-1 ${item.color}`}>{item.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isDark ? 'bg-white/[0.04]' : 'bg-gray-100'}`}>
          <Search size={14} className={isDark ? 'text-gray-500' : 'text-gray-400'} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search deployments..."
            className={`bg-transparent text-sm outline-none w-48 ${isDark ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'}`}
          />
        </div>
        {['all', 'Completed', 'Failed', 'Progressing'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${filter === f ? 'bg-blue-500/10 text-blue-400' : isDark ? 'text-gray-500 hover:bg-white/[0.04]' : 'text-gray-400 hover:bg-gray-100'}`}
          >
            {f === 'all' ? 'All' : f}
          </button>
        ))}
      </div>

      {/* Deployment cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.slice(0, 50).map((dep, i) => {
          const status = getRolloutStatus(dep);
          const desired = dep.spec.replicas;
          const available = dep.status.availableReplicas || 0;
          const updated = dep.status.updatedReplicas || 0;
          const unavailable = dep.status.unavailableReplicas || 0;
          const image = (dep.spec.template as { spec?: { containers?: { image?: string }[] } })?.spec?.containers?.[0]?.image || 'unknown';
          const age = new Date(dep.metadata.creationTimestamp).toLocaleDateString();

          return (
            <motion.div key={dep.metadata.uid || i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className={`rounded-xl p-5 border transition-colors hover:scale-[1.01] ${isDark ? 'bg-[#0d1220] border-white/[0.06] hover:border-white/[0.12]' : 'bg-white border-gray-200 shadow-sm hover:border-gray-300'}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-400/20">
                    <Rocket size={18} className="text-blue-400" />
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{dep.metadata.name}</p>
                    <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{dep.metadata.namespace}</p>
                  </div>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 ${rolloutBg(status)}`}>
                  {rolloutIcon(status)} {status}
                </span>
              </div>

              {/* Replica bars */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between text-xs">
                  <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Replicas</span>
                  <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>{available}/{desired} available</span>
                </div>
                <div className={`h-3 rounded-full overflow-hidden ${isDark ? 'bg-white/[0.06]' : 'bg-gray-200'}`}>
                  <div className="h-full flex">
                    {desired > 0 && <div className="bg-emerald-400 transition-all" style={{ width: `${(updated / desired) * 100}%` }} />}
                    {desired > 0 && <div className="bg-blue-400 transition-all" style={{ width: `${(Math.max(0, available - updated) / desired) * 100}%` }} />}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[10px]">
                  <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className={isDark ? 'text-gray-500' : 'text-gray-400'}>Updated: {updated}</span></div>
                  <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-400" /><span className={isDark ? 'text-gray-500' : 'text-gray-400'}>Available: {available}</span></div>
                  {unavailable > 0 && <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-400" /><span className="text-red-400">Unavailable: {unavailable}</span></div>}
                </div>
              </div>

              <div className={`flex items-center justify-between pt-3 border-t ${isDark ? 'border-white/[0.06]' : 'border-gray-100'}`}>
                <p className={`text-[10px] font-mono truncate max-w-[250px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{image}</p>
                <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{age}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
