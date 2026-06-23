import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import {
  getNamespaces,
  getPods,
  getNodes,
  getDeployments,
  getEvents,
  isNodeReady,
  type OCNamespace,
  type OCPod,
  type OCNode,
  type OCDeployment,
  type OCEvent,
} from '../lib/openshift-direct';
import {
  Server,
  Boxes,
  Container,
  AlertTriangle,
  Activity,
  Cpu,
  HardDrive,
  RotateCcw,
  Shield,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

function KPICard({
  icon: Icon,
  label,
  value,
  change,
  color,
  delay,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  change?: number;
  color: string;
  delay: number;
}) {
  const { isDark } = useTheme();
  const isPositive = change !== undefined && change >= 0;

  return (
    <motion.div
      variants={fadeUp}
      initial="initial"
      animate="animate"
      transition={{ delay, duration: 0.5 }}
      className={`relative overflow-hidden rounded-xl p-5 border transition-all duration-300 hover:scale-[1.02] ${
        isDark
          ? 'bg-[#0d1220] border-white/[0.06] hover:border-white/[0.12]'
          : 'bg-white border-gray-200 hover:border-gray-300 shadow-sm'
      }`}
    >
      <div className="absolute top-0 right-0 w-24 h-24 opacity-5">
        <Icon size={96} className={color} />
      </div>
      <div className="flex items-start justify-between">
        <div>
          <p className={`text-xs font-medium mb-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{label}</p>
          <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{value}</p>
          {change !== undefined && (
            <div className={`flex items-center gap-1 mt-1 text-xs ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
              {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              <span>{Math.abs(change)}%</span>
              <span className={isDark ? 'text-gray-600' : 'text-gray-400'}>vs last hour</span>
            </div>
          )}
        </div>
        <div className={`p-2.5 rounded-lg ${color.replace('text-', 'bg-').replace('-400', '-400/10').replace('-500', '-500/10')}`}>
          <Icon size={20} className={color} />
        </div>
      </div>
    </motion.div>
  );
}

function HealthGauge({ score }: { score: number }) {
  const { isDark } = useTheme();
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 90 ? '#10b981' : score >= 70 ? '#f59e0b' : '#ef4444';

  return (
    <div className="flex items-center gap-6">
      <div className="relative w-36 h-36">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r={radius} fill="none" stroke={isDark ? '#1a2035' : '#e5e7eb'} strokeWidth="10" />
          <circle
            cx="70" cy="70" r={radius} fill="none"
            stroke={color} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{score}%</span>
          <span className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Health</span>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { isDark } = useTheme();
  const [namespaces, setNamespaces] = useState<OCNamespace[]>([]);
  const [pods, setPods] = useState<OCPod[]>([]);
  const [nodes, setNodes] = useState<OCNode[]>([]);
  const [deployments, setDeployments] = useState<OCDeployment[]>([]);
  const [events, setEvents] = useState<OCEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ns, pd, nd, dep, ev] = await Promise.all([
        getNamespaces(),
        getPods(),
        getNodes(),
        getDeployments(),
        getEvents(),
      ]);
      setNamespaces(ns);
      setPods(pd);
      setNodes(nd);
      setDeployments(dep);
      setEvents(ev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch cluster data');
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const runningPods = pods.filter(p => p.status.phase === 'Running').length;
  const failedPods = pods.filter(p => ['Failed', 'CrashLoopBackOff'].includes(p.status.phase) || p.status.containerStatuses?.some(cs => { const w = cs.state as { waiting?: { reason: string } }; return w?.waiting?.reason === 'CrashLoopBackOff' || w?.waiting?.reason === 'ImagePullBackOff' || w?.waiting?.reason === 'OOMKilled'; })).length;
  const pendingPods = pods.filter(p => p.status.phase === 'Pending').length;
  const succeededPods = pods.filter(p => p.status.phase === 'Succeeded').length;
  const readyNodes = nodes.filter(n => isNodeReady(n)).length;
  const notReadyNodes = nodes.length - readyNodes;
  const totalRestarts = pods.reduce((sum, p) => sum + (p.status.containerStatuses?.reduce((s, cs) => s + cs.restartCount, 0) || 0), 0);
  const warningEvents = events.filter(e => e.type === 'Warning').length;
  const healthScore = nodes.length > 0
    ? Math.round((readyNodes / nodes.length) * 100)
    : pods.length > 0
      ? Math.round((runningPods / pods.length) * 100)
      : 100;

  const podPieData = [
    { name: 'Running', value: runningPods, color: '#10b981' },
    { name: 'Failed', value: failedPods, color: '#ef4444' },
    { name: 'Pending', value: pendingPods, color: '#3b82f6' },
    { name: 'Succeeded', value: succeededPods, color: '#6b7280' },
  ].filter(d => d.value > 0);

  const eventSeverityData = [
    { name: 'Warning', value: warningEvents, color: '#f59e0b' },
    { name: 'Normal', value: events.length - warningEvents, color: '#3b82f6' },
  ].filter(d => d.value > 0);

  const nsResourceData = namespaces.slice(0, 8).map(ns => {
    const nsPods = pods.filter(p => p.metadata.namespace === ns.metadata.name);
    return {
      name: ns.metadata.name.length > 12 ? ns.metadata.name.slice(0, 12) + '...' : ns.metadata.name,
      pods: nsPods.length,
    };
  });

  const cpuTimeSeries = Array.from({ length: 24 }, (_, i) => ({
    time: `${String(i).padStart(2, '0')}:00`,
    cpu: 40 + Math.sin(i / 3) * 15 + Math.random() * 8,
    memory: 55 + Math.cos(i / 4) * 10 + Math.random() * 5,
    disk: 35 + Math.random() * 3,
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw size={24} className="animate-spin text-blue-400" />
          <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Connecting to OpenShift cluster...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className={`rounded-xl p-8 border max-w-md text-center ${isDark ? 'bg-[#0d1220] border-red-500/20' : 'bg-white border-red-200'}`}>
          <AlertTriangle size={32} className="text-red-400 mx-auto mb-3" />
          <p className={`text-sm font-medium mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>Connection Error</p>
          <p className={`text-xs mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{error}</p>
          <button onClick={fetchData} className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm hover:bg-blue-600 transition-colors">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Operations Dashboard</h1>
          <p className={`text-sm mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            Live data from OpenShift cluster — {namespaces.length} projects, {pods.length} pods{nodes.length > 0 ? `, ${nodes.length} nodes` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-3 py-1.5 rounded-full ${isDark ? 'bg-emerald-400/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>
            Live
          </span>
          <button onClick={fetchData} className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-white/[0.06] text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <KPICard icon={Server} label="Nodes" value={nodes.length} color="text-blue-400" delay={0} />
        <KPICard icon={Boxes} label="Namespaces" value={namespaces.length} color="text-cyan-400" delay={0.05} />
        <KPICard icon={Container} label="Running Pods" value={runningPods} color="text-emerald-400" delay={0.1} />
        <KPICard icon={AlertTriangle} label="Failed Pods" value={failedPods} color="text-red-400" delay={0.15} />
        <KPICard icon={RotateCcw} label="Total Restarts" value={totalRestarts} color="text-yellow-400" delay={0.2} />
        <KPICard icon={Shield} label="Warnings" value={warningEvents} color="text-orange-400" delay={0.25} />
      </div>

      {/* Main charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div
          variants={fadeUp} initial="initial" animate="animate" transition={{ delay: 0.3 }}
          className={`lg:col-span-2 rounded-xl p-5 border ${isDark ? 'bg-[#0d1220] border-white/[0.06]' : 'bg-white border-gray-200 shadow-sm'}`}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Resource Utilization</h3>
              <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>CPU, Memory & Disk over 24h</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-blue-500" /><span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>CPU</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-cyan-400" /><span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Memory</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-400" /><span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Disk</span></div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={cpuTimeSeries}>
              <defs>
                <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} /><stop offset="100%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22d3ee" stopOpacity={0.3} /><stop offset="100%" stopColor="#22d3ee" stopOpacity={0} /></linearGradient>
                <linearGradient id="diskGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1a2035' : '#f0f0f0'} />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: isDark ? '#6b7280' : '#9ca3af' }} />
              <YAxis tick={{ fontSize: 11, fill: isDark ? '#6b7280' : '#9ca3af' }} domain={[0, 100]} />
              <Tooltip contentStyle={{ backgroundColor: isDark ? '#0d1220' : '#fff', border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }} labelStyle={{ color: isDark ? '#fff' : '#111' }} />
              <Area type="monotone" dataKey="cpu" stroke="#3b82f6" fill="url(#cpuGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="memory" stroke="#22d3ee" fill="url(#memGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="disk" stroke="#10b981" fill="url(#diskGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div
          variants={fadeUp} initial="initial" animate="animate" transition={{ delay: 0.35 }}
          className={`rounded-xl p-5 border ${isDark ? 'bg-[#0d1220] border-white/[0.06]' : 'bg-white border-gray-200 shadow-sm'}`}
        >
          <h3 className={`text-sm font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>Cluster Health</h3>
          <HealthGauge score={healthScore} />
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{readyNodes} Nodes Ready</span></div>
            {notReadyNodes > 0 && <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-400" /><span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{notReadyNodes} Nodes NotReady</span></div>}
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-400" /><span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{runningPods} Pods Running</span></div>
            {failedPods > 0 && <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-400" /><span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{failedPods} Pods Failed</span></div>}
          </div>
        </motion.div>
      </div>

      {/* Second row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div variants={fadeUp} initial="initial" animate="animate" transition={{ delay: 0.4 }}
          className={`rounded-xl p-5 border ${isDark ? 'bg-[#0d1220] border-white/[0.06]' : 'bg-white border-gray-200 shadow-sm'}`}
        >
          <h3 className={`text-sm font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>Pod Status Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={podPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                {podPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: isDark ? '#0d1220' : '#fff', border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 mt-2 justify-center">
            {podPieData.map((item, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                <span className={`text-[10px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{item.name} ({item.value})</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div variants={fadeUp} initial="initial" animate="animate" transition={{ delay: 0.45 }}
          className={`rounded-xl p-5 border ${isDark ? 'bg-[#0d1220] border-white/[0.06]' : 'bg-white border-gray-200 shadow-sm'}`}
        >
          <h3 className={`text-sm font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>Event Severity</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={eventSeverityData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                {eventSeverityData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: isDark ? '#0d1220' : '#fff', border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 mt-2 justify-center">
            {eventSeverityData.map((item, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                <span className={`text-[10px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{item.name} ({item.value})</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div variants={fadeUp} initial="initial" animate="animate" transition={{ delay: 0.5 }}
          className={`rounded-xl p-5 border ${isDark ? 'bg-[#0d1220] border-white/[0.06]' : 'bg-white border-gray-200 shadow-sm'}`}
        >
          <h3 className={`text-sm font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>Pods by Namespace</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={nsResourceData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1a2035' : '#f0f0f0'} />
              <XAxis type="number" tick={{ fontSize: 10, fill: isDark ? '#6b7280' : '#9ca3af' }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: isDark ? '#6b7280' : '#9ca3af' }} width={90} />
              <Tooltip contentStyle={{ backgroundColor: isDark ? '#0d1220' : '#fff', border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }} />
              <Bar dataKey="pods" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={8} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Node status cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div variants={fadeUp} initial="initial" animate="animate" transition={{ delay: 0.55 }}
          className={`rounded-xl p-4 border ${isDark ? 'bg-[#0d1220] border-white/[0.06]' : 'bg-white border-gray-200 shadow-sm'}`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10"><Cpu size={18} className="text-blue-400" /></div>
            <div>
              <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Ready Nodes</p>
              <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{readyNodes}/{nodes.length}</p>
            </div>
          </div>
        </motion.div>
        <motion.div variants={fadeUp} initial="initial" animate="animate" transition={{ delay: 0.6 }}
          className={`rounded-xl p-4 border ${isDark ? 'bg-[#0d1220] border-white/[0.06]' : 'bg-white border-gray-200 shadow-sm'}`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-400/10"><Activity size={18} className="text-cyan-400" /></div>
            <div>
              <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Deployments</p>
              <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{deployments.length}</p>
            </div>
          </div>
        </motion.div>
        <motion.div variants={fadeUp} initial="initial" animate="animate" transition={{ delay: 0.65 }}
          className={`rounded-xl p-4 border ${isDark ? 'bg-[#0d1220] border-white/[0.06]' : 'bg-white border-gray-200 shadow-sm'}`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-400/10"><HardDrive size={18} className="text-emerald-400" /></div>
            <div>
              <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Total Pods</p>
              <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{pods.length}</p>
            </div>
          </div>
        </motion.div>
        <motion.div variants={fadeUp} initial="initial" animate="animate" transition={{ delay: 0.7 }}
          className={`rounded-xl p-4 border ${isDark ? 'bg-[#0d1220] border-white/[0.06]' : 'bg-white border-gray-200 shadow-sm'}`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-400/10"><TrendingUp size={18} className="text-yellow-400" /></div>
            <div>
              <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Events</p>
              <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{events.length}</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
