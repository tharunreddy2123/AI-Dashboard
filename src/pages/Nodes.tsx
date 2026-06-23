import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { getNodes, isNodeReady, getNodeRole, getNodeConditions, type OCNode } from '../lib/openshift-direct';
import { Search, Server, CheckCircle, XCircle, AlertTriangle, Cpu, RefreshCw } from 'lucide-react';

export default function Nodes() {
  const { isDark } = useTheme();
  const [nodes, setNodes] = useState<OCNode[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const nd = await getNodes();
      setNodes(nd);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = nodes.filter(n => {
    const matchSearch = n.metadata.name.toLowerCase().includes(search.toLowerCase());
    const role = getNodeRole(n);
    const matchRole = roleFilter === 'all' || role === roleFilter;
    return matchSearch && matchRole;
  });

  const selected = nodes.find(n => n.metadata.name === selectedNode);

  const readyCount = nodes.filter(n => isNodeReady(n)).length;
  const notReadyCount = nodes.length - readyCount;
  const pressureCount = nodes.filter(n => getNodeConditions(n).some(c => c.type === 'MemoryPressure' && c.status === 'True')).length;
  const workerCount = nodes.filter(n => getNodeRole(n) === 'worker').length;

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
          <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Node Monitoring</h1>
          <p className={`text-sm mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            {nodes.length} nodes from OpenShift cluster
          </p>
        </div>
        <button onClick={fetchData} className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-white/[0.06] text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Nodes', value: nodes.length, icon: Server, color: 'text-blue-400' },
          { label: 'Ready', value: readyCount, icon: CheckCircle, color: 'text-emerald-400' },
          { label: 'NotReady', value: notReadyCount, icon: XCircle, color: 'text-red-400' },
          { label: 'Memory Pressure', value: pressureCount, icon: AlertTriangle, color: 'text-yellow-400' },
          { label: 'Workers', value: workerCount, icon: Cpu, color: 'text-cyan-400' },
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
      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isDark ? 'bg-white/[0.04]' : 'bg-gray-100'}`}>
          <Search size={14} className={isDark ? 'text-gray-500' : 'text-gray-400'} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search nodes..."
            className={`bg-transparent text-sm outline-none w-48 ${isDark ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'}`}
          />
        </div>
        {['all', 'master', 'worker'].map(r => (
          <button key={r} onClick={() => setRoleFilter(r)}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${roleFilter === r ? 'bg-blue-500/10 text-blue-400' : isDark ? 'text-gray-500 hover:bg-white/[0.04]' : 'text-gray-400 hover:bg-gray-100'}`}
          >
            {r === 'all' ? 'All Roles' : r.charAt(0).toUpperCase() + r.slice(1)}
          </button>
        ))}
      </div>

      {/* Node grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((node, i) => {
          const ready = isNodeReady(node);
          const role = getNodeRole(node);
          const conditions = getNodeConditions(node);
          const hasPressure = conditions.some(c => c.type === 'MemoryPressure' && c.status === 'True');
          const cpu = node.status.allocatable?.cpu || '0';
          const memory = node.status.allocatable?.memory || '0';
          const pods = node.status.allocatable?.pods || '0';

          return (
            <motion.div key={node.metadata.uid || i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              onClick={() => setSelectedNode(selectedNode === node.metadata.name ? null : node.metadata.name)}
              className={`rounded-xl p-5 border cursor-pointer transition-all hover:scale-[1.01] ${
                !ready
                  ? isDark ? 'bg-red-500/5 border-red-500/20' : 'bg-red-50 border-red-200'
                  : hasPressure
                    ? isDark ? 'bg-yellow-500/5 border-yellow-500/20' : 'bg-yellow-50 border-yellow-200'
                    : isDark ? 'bg-[#0d1220] border-white/[0.06] hover:border-white/[0.12]' : 'bg-white border-gray-200 shadow-sm hover:border-gray-300'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${ready ? 'bg-emerald-400/10' : 'bg-red-400/10'}`}>
                    <Server size={18} className={ready ? 'text-emerald-400' : 'text-red-400'} />
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{node.metadata.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${role === 'master' ? 'bg-blue-400/10 text-blue-400' : 'bg-cyan-400/10 text-cyan-400'}`}>{role}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${ready ? 'bg-emerald-400/10 text-emerald-400' : 'bg-red-400/10 text-red-400'}`}>{ready ? 'Ready' : 'NotReady'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Conditions */}
              <div className="flex flex-wrap gap-1 mb-3">
                {conditions.map((c, j) => (
                  <span key={j} className={`text-[9px] px-1.5 py-0.5 rounded ${
                    c.status === 'True'
                      ? c.type === 'Ready' ? 'bg-emerald-400/10 text-emerald-400' : 'bg-red-400/10 text-red-400'
                      : 'bg-white/[0.03] text-gray-500'
                  }`}>{c.type}</span>
                ))}
              </div>

              {/* Capacity */}
              <div className={`flex items-center justify-between mt-4 pt-3 border-t text-xs ${isDark ? 'border-white/[0.06] text-gray-500' : 'border-gray-100 text-gray-400'}`}>
                <span>CPU: {cpu}</span>
                <span>Mem: {memory}</span>
                <span>Pods: {pods}</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Node detail panel */}
      {selectedNode && selected && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-xl p-6 border ${isDark ? 'bg-[#0d1220] border-white/[0.06]' : 'bg-white border-gray-200 shadow-sm'}`}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{selected.metadata.name}</h3>
            <button onClick={() => setSelectedNode(null)} className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Close</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'CPU Capacity', value: selected.status.capacity?.cpu || '-' },
              { label: 'Memory Capacity', value: selected.status.capacity?.memory || '-' },
              { label: 'Pod Capacity', value: selected.status.capacity?.pods || '-' },
              { label: 'CPU Allocatable', value: selected.status.allocatable?.cpu || '-' },
              { label: 'Memory Allocatable', value: selected.status.allocatable?.memory || '-' },
              { label: 'Pod Allocatable', value: selected.status.allocatable?.pods || '-' },
            ].map((item, i) => (
              <div key={i} className={`p-3 rounded-lg ${isDark ? 'bg-white/[0.03]' : 'bg-gray-50'}`}>
                <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{item.label}</p>
                <p className={`text-sm font-medium mt-0.5 truncate ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{item.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <p className={`text-xs font-medium mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Conditions</p>
            <div className="space-y-2">
              {selected.status.conditions.map((c, i) => (
                <div key={i} className={`flex items-center gap-3 p-2 rounded-lg ${isDark ? 'bg-white/[0.03]' : 'bg-gray-50'}`}>
                  <div className={`w-2 h-2 rounded-full ${c.status === 'True' ? (c.type === 'Ready' ? 'bg-emerald-400' : 'bg-yellow-400') : 'bg-emerald-400'}`} />
                  <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{c.type}</span>
                  <span className={`text-xs ${c.status === 'True' ? (c.type === 'Ready' ? 'text-emerald-400' : 'text-yellow-400') : 'text-emerald-400'}`}>{c.status}</span>
                  <span className={`text-xs truncate ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{c.message}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
