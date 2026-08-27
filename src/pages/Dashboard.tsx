import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  RefreshCw,
  Clock,
  Layers,
  Radio,
  ChevronDown,
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

// ── helpers ──────────────────────────────────────────────────────────────────

function nowLabel() {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function nowFull() {
  return new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

/** Derive a pseudo-CPU% from pod counts / node allocatable cores */
function deriveMetrics(pods: OCPod[], nodes: OCNode[]) {
  const totalPods = pods.length;
  const runningPods = pods.filter(p => p.status.phase === 'Running').length;
  const totalRestarts = pods.reduce(
    (s, p) => s + (p.status.containerStatuses?.reduce((r, cs) => r + cs.restartCount, 0) ?? 0), 0
  );

  // Sum allocatable cores across nodes (format: "4" or "4000m")
  let totalCores = 0;
  nodes.forEach(n => {
    const raw = n.status.allocatable?.cpu ?? '0';
    totalCores += raw.endsWith('m') ? parseInt(raw) / 1000 : parseFloat(raw);
  });
  if (totalCores === 0) totalCores = 4; // fallback

  // Heuristic: each running pod ≈ 0.05 cores, +0.02 per restart
  const usedCores = runningPods * 0.05 + totalRestarts * 0.02;
  const cpu = Math.min(95, Math.round((usedCores / totalCores) * 100));

  // Memory: rough estimate — running pods consume ~2% each of total
  const mem = Math.min(95, Math.round((runningPods / totalPods || 0) * 60 + 10));

  // Pod density as disk-pressure proxy
  const disk = Math.min(95, Math.round((totalPods / 50) * 40 + 15));

  return { cpu: isNaN(cpu) ? 12 : cpu, mem: isNaN(mem) ? 30 : mem, disk: isNaN(disk) ? 15 : disk };
}

// ── sub-components ────────────────────────────────────────────────────────────

function KPICard({
  icon: Icon, label, value, sub, color, delay,
}: {
  icon: React.ElementType; label: string; value: string | number;
  sub?: string; color: string; delay: number;
}) {
  const { isDark } = useTheme();
  return (
    <motion.div
      variants={fadeUp} initial="initial" animate="animate" transition={{ delay, duration: 0.4 }}
      className={`relative overflow-hidden rounded-xl p-5 border transition-all duration-300 hover:scale-[1.02] ${
        isDark ? 'bg-[#0d1220] border-white/[0.06] hover:border-white/[0.12]'
               : 'bg-white border-gray-200 hover:border-gray-300 shadow-sm'
      }`}
    >
      <div className="absolute top-0 right-0 w-20 h-20 opacity-[0.04]">
        <Icon size={80} className={color} />
      </div>
      <div className="flex items-start justify-between">
        <div>
          <p className={`text-xs font-medium mb-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{label}</p>
          <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{value}</p>
          {sub && <p className={`text-[11px] mt-0.5 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>{sub}</p>}
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
  const r = 56;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 90 ? '#10b981' : score >= 70 ? '#f59e0b' : '#ef4444';
  const label = score >= 90 ? 'Healthy' : score >= 70 ? 'Degraded' : 'Critical';
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-32 h-32">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
          <circle cx="64" cy="64" r={r} fill="none" stroke={isDark ? '#1a2035' : '#e5e7eb'} strokeWidth="9" />
          <circle cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset}
            className="transition-all duration-1000 ease-out" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{score}%</span>
          <span className="text-[10px]" style={{ color }}>{label}</span>
        </div>
      </div>
    </div>
  );
}

/** Horizontal utilisation bar with label, value, and colour threshold */
function UtilBar({ label, value, unit = '%', warn = 70, crit = 85 }: {
  label: string; value: number; unit?: string; warn?: number; crit?: number;
}) {
  const { isDark } = useTheme();
  const color = value >= crit ? '#ef4444' : value >= warn ? '#f59e0b' : '#10b981';
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{label}</span>
        <span className="text-xs font-semibold" style={{ color }}>{value}{unit}</span>
      </div>
      <div className={`w-full rounded-full h-1.5 ${isDark ? 'bg-white/[0.06]' : 'bg-gray-100'}`}>
        <div
          className="h-1.5 rounded-full transition-all duration-700"
          style={{ width: `${Math.min(value, 100)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

const WINDOW = 20; // keep last 20 data points

// Available live-poll intervals in seconds
const INTERVALS = [
  { label: '10 s',  ms: 10_000 },
  { label: '30 s',  ms: 30_000 },
  { label: '1 min', ms: 60_000 },
  { label: '2 min', ms: 120_000 },
];

export default function Dashboard() {
  const { isDark } = useTheme();
  const [namespaces,   setNamespaces]   = useState<OCNamespace[]>([]);
  const [pods,         setPods]         = useState<OCPod[]>([]);
  const [nodes,        setNodes]        = useState<OCNode[]>([]);
  const [deployments,  setDeployments]  = useState<OCDeployment[]>([]);
  const [events,       setEvents]       = useState<OCEvent[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [lastRefresh,  setLastRefresh]  = useState('');
  const [refreshing,   setRefreshing]   = useState(false); // silent refresh indicator

  // live-poll state
  const [liveOn,       setLiveOn]       = useState(false);
  const [intervalMs,   setIntervalMs]   = useState(30_000);
  const [showInterval, setShowInterval] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // countdown to next live refresh
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextTickRef  = useRef<number>(0);

  // rolling time-series for resource utilisation
  const [series, setSeries] = useState<{ time: string; cpu: number; mem: number; disk: number }[]>([]);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const [ns, pd, nd, dep, ev] = await Promise.all([
        getNamespaces(), getPods(), getNodes(), getDeployments(), getEvents(),
      ]);
      setNamespaces(ns);
      setPods(pd);
      setNodes(nd);
      setDeployments(dep);
      setEvents(ev);
      setLastRefresh(nowFull());

      // Push new data point into rolling series
      const { cpu, mem, disk } = deriveMetrics(pd, nd);
      const point = { time: nowLabel(), cpu, mem, disk };
      setSeries(prev => [...prev.slice(-(WINDOW - 1)), point]);
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Failed to fetch cluster data');
    }
    if (!silent) setLoading(false);
    else setRefreshing(false);
  }, []);

  // Initial load
  useEffect(() => { fetchData(); }, [fetchData]);

  // ── live polling ─────────────────────────────────────────────────────────

  const startCountdown = useCallback((ms: number) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    nextTickRef.current = Date.now() + ms;
    setCountdown(Math.round(ms / 1000));
    countdownRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.round((nextTickRef.current - Date.now()) / 1000));
      setCountdown(remaining);
    }, 500);
  }, []);

  const stopCountdown = useCallback(() => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setCountdown(0);
  }, []);

  const startLive = useCallback((ms: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      fetchData(true);
      nextTickRef.current = Date.now() + ms;
    }, ms);
    startCountdown(ms);
  }, [fetchData, startCountdown]);

  const stopLive = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    stopCountdown();
  }, [stopCountdown]);

  // When liveOn or intervalMs changes, restart/stop the timer
  useEffect(() => {
    if (liveOn) {
      startLive(intervalMs);
    } else {
      stopLive();
    }
    return () => stopLive();
  }, [liveOn, intervalMs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close interval dropdown when clicking outside
  useEffect(() => {
    if (!showInterval) return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-interval-menu]')) setShowInterval(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showInterval]);

  // ── computed stats ────────────────────────────────────────────────────────
  const runningPods   = pods.filter(p => p.status.phase === 'Running').length;
  const failedPods    = pods.filter(p =>
    p.status.phase === 'Failed' ||
    p.status.containerStatuses?.some(cs => {
      const w = cs.state as { waiting?: { reason: string } };
      return ['CrashLoopBackOff', 'ImagePullBackOff', 'OOMKilled'].includes(w?.waiting?.reason ?? '');
    })
  ).length;
  const pendingPods   = pods.filter(p => p.status.phase === 'Pending').length;
  const succeededPods = pods.filter(p => p.status.phase === 'Succeeded').length;
  const readyNodes    = nodes.filter(n => isNodeReady(n)).length;
  const notReadyNodes = nodes.length - readyNodes;
  const totalRestarts = pods.reduce((s, p) => s + (p.status.containerStatuses?.reduce((r, cs) => r + cs.restartCount, 0) ?? 0), 0);
  const warningEvents = events.filter(e => e.type === 'Warning').length;
  const healthScore   = nodes.length > 0
    ? Math.round((readyNodes / nodes.length) * 100)
    : pods.length > 0 ? Math.round((runningPods / pods.length) * 100) : 100;

  const { cpu: curCpu, mem: curMem, disk: curDisk } = deriveMetrics(pods, nodes);

  const podPieData = [
    { name: 'Running',   value: runningPods,   color: '#10b981' },
    { name: 'Failed',    value: failedPods,    color: '#ef4444' },
    { name: 'Pending',   value: pendingPods,   color: '#3b82f6' },
    { name: 'Succeeded', value: succeededPods, color: '#6b7280' },
  ].filter(d => d.value > 0);

  const nsResourceData = namespaces.slice(0, 8).map(ns => {
    const nsPods = pods.filter(p => p.metadata.namespace === ns.metadata.name);
    return {
      name: ns.metadata.name.length > 14 ? ns.metadata.name.slice(0, 14) + '…' : ns.metadata.name,
      running: nsPods.filter(p => p.status.phase === 'Running').length,
      failed:  nsPods.filter(p => p.status.phase === 'Failed').length,
      total:   nsPods.length,
    };
  });

  // Custom tooltip for the area chart
  const AreaTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className={`rounded-lg border px-3 py-2 text-xs shadow-lg ${isDark ? 'bg-[#0d1220] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'}`}>
        <p className={`font-semibold mb-1 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{label}</p>
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="capitalize">{p.dataKey}:</span>
            <span className="font-bold">{p.value}%</span>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw size={24} className="animate-spin text-blue-400" />
          <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Connecting to OpenShift cluster…</p>
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
          <button onClick={() => fetchData()} className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm hover:bg-blue-600 transition-colors">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Operations Dashboard</h1>
          <p className={`text-sm mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            {namespaces.length} projects · {pods.length} pods{nodes.length > 0 ? ` · ${nodes.length} nodes` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Last updated */}
          {lastRefresh && (
            <div className={`hidden md:flex items-center gap-1.5 text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              <Clock size={12} />
              <span>Updated {lastRefresh}</span>
            </div>
          )}

          {/* Silent refresh spinner */}
          {refreshing && (
            <RefreshCw size={13} className="animate-spin text-blue-400" />
          )}

          {/* Manual refresh */}
          <button
            onClick={() => fetchData()}
            title="Refresh now"
            className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-white/[0.06] text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-500'}`}
          >
            <RefreshCw size={15} />
          </button>

          {/* ── Live button + interval picker ── */}
          <div className="relative flex items-center" data-interval-menu>
            {/* Interval picker dropdown */}
            <button
              onClick={() => setShowInterval(v => !v)}
              title="Set refresh interval"
              className={`flex items-center gap-0.5 pl-2 pr-1 py-1.5 rounded-l-lg border-r text-xs font-medium transition-colors ${
                liveOn
                  ? isDark
                    ? 'bg-emerald-500/15 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/25'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100'
                  : isDark
                    ? 'bg-white/[0.04] border-white/[0.08] text-gray-400 hover:bg-white/[0.08]'
                    : 'bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {INTERVALS.find(i => i.ms === intervalMs)?.label ?? '30 s'}
              <ChevronDown size={10} className="ml-0.5" />
            </button>

            {/* Live toggle button */}
            <button
              onClick={() => setLiveOn(v => !v)}
              title={liveOn ? 'Stop live updates' : 'Start live updates'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-r-lg text-xs font-semibold transition-all ${
                liveOn
                  ? isDark
                    ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                    : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                  : isDark
                    ? 'bg-white/[0.04] text-gray-400 hover:bg-white/[0.08]'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {liveOn ? (
                <>
                  {/* Pulsing dot */}
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                  </span>
                  Live
                  {countdown > 0 && (
                    <span className={`ml-0.5 text-[10px] font-mono ${isDark ? 'text-emerald-600' : 'text-emerald-400'}`}>
                      {countdown}s
                    </span>
                  )}
                </>
              ) : (
                <>
                  <Radio size={12} />
                  Live
                </>
              )}
            </button>

            {/* Interval dropdown menu */}
            <AnimatePresence>
              {showInterval && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.12 }}
                  className={`absolute top-full right-0 mt-1.5 z-50 rounded-xl border shadow-xl overflow-hidden w-32 ${
                    isDark ? 'bg-[#0d1220] border-white/[0.08]' : 'bg-white border-gray-200'
                  }`}
                >
                  <p className={`text-[10px] font-semibold uppercase tracking-wider px-3 pt-2.5 pb-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    Interval
                  </p>
                  {INTERVALS.map(iv => (
                    <button
                      key={iv.ms}
                      onClick={() => {
                        setIntervalMs(iv.ms);
                        setShowInterval(false);
                        if (liveOn) startLive(iv.ms);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors flex items-center justify-between ${
                        intervalMs === iv.ms
                          ? isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
                          : isDark ? 'text-gray-300 hover:bg-white/[0.06]' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {iv.label}
                      {intervalMs === iv.ms && <span className="text-[9px]">✓</span>}
                    </button>
                  ))}
                  <div className={`px-3 py-2 border-t ${isDark ? 'border-white/[0.06]' : 'border-gray-100'}`}>
                    <p className={`text-[10px] ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                      Only active when Live is ON
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard icon={Server}        label="Nodes"         value={nodes.length}       sub={`${readyNodes} ready`}       color="text-blue-400"    delay={0}    />
        <KPICard icon={Boxes}         label="Namespaces"    value={namespaces.length}  sub="projects"                    color="text-cyan-400"    delay={0.05} />
        <KPICard icon={Container}     label="Running Pods"  value={runningPods}        sub={`of ${pods.length} total`}   color="text-emerald-400" delay={0.1}  />
        <KPICard icon={AlertTriangle} label="Failed Pods"   value={failedPods}         sub={pendingPods > 0 ? `${pendingPods} pending` : 'none pending'} color="text-red-400" delay={0.15} />
        <KPICard icon={RotateCcw}     label="Total Restarts" value={totalRestarts}     sub="all namespaces"              color="text-yellow-400"  delay={0.2}  />
        <KPICard icon={Shield}        label="Warnings"      value={warningEvents}      sub={`of ${events.length} events`} color="text-orange-400" delay={0.25} />
      </div>

      {/* ── Resource Utilisation (full-width) ── */}
      <motion.div
        variants={fadeUp} initial="initial" animate="animate" transition={{ delay: 0.3 }}
        className={`rounded-xl border ${isDark ? 'bg-[#0d1220] border-white/[0.06]' : 'bg-white border-gray-200 shadow-sm'}`}
      >
        {/* card header */}
        <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 px-5 pt-5 pb-4 border-b ${isDark ? 'border-white/[0.06]' : 'border-gray-100'}`}>
          <div>
            <h3 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Resource Utilisation</h3>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              Rolling 10-min window · auto-refreshes every 30 s
            </p>
          </div>
          <div className="flex items-center gap-5">
            {[
              { key: 'CPU',    color: '#3b82f6', val: curCpu  },
              { key: 'Memory', color: '#22d3ee', val: curMem  },
              { key: 'Pods',   color: '#10b981', val: curDisk },
            ].map(({ key, color, val }) => (
              <div key={key} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{key}</span>
                <span className="text-xs font-bold" style={{ color }}>{val}%</span>
              </div>
            ))}
            {lastRefresh && (
              <div className={`flex items-center gap-1 text-[11px] ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                <Clock size={10} />
                <span>{lastRefresh}</span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4">
          {/* Area chart — 3/4 width */}
          <div className="lg:col-span-3 px-4 pt-4 pb-2">
            {series.length < 2 ? (
              <div className="flex items-center justify-center h-[220px]">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <RefreshCw size={14} className="animate-spin" />
                  Collecting data points…
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={series} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gCpu"  x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} /><stop offset="100%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gMem"  x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22d3ee" stopOpacity={0.25} /><stop offset="100%" stopColor="#22d3ee" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gDisk" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.25} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1a2035' : '#f0f4f8'} vertical={false} />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 10, fill: isDark ? '#6b7280' : '#9ca3af' }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: isDark ? '#6b7280' : '#9ca3af' }}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 100]}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <Tooltip content={<AreaTooltip />} />
                  <Area type="monotone" dataKey="cpu"  stroke="#3b82f6" fill="url(#gCpu)"  strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="CPU" />
                  <Area type="monotone" dataKey="mem"  stroke="#22d3ee" fill="url(#gMem)"  strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="Memory" />
                  <Area type="monotone" dataKey="disk" stroke="#10b981" fill="url(#gDisk)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="Pods" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Current utilisation panel — 1/4 width */}
          <div className={`flex flex-col justify-center gap-5 px-5 py-5 lg:border-l ${isDark ? 'border-white/[0.06]' : 'border-gray-100'}`}>
            <p className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Current</p>
            <UtilBar label="CPU Utilisation"    value={curCpu}  />
            <UtilBar label="Memory Pressure"    value={curMem}  />
            <UtilBar label="Pod Density"        value={curDisk} />

            <div className={`pt-3 mt-1 border-t text-xs space-y-1.5 ${isDark ? 'border-white/[0.06] text-gray-500' : 'border-gray-100 text-gray-400'}`}>
              <div className="flex justify-between">
                <span>Data points</span>
                <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>{series.length} / {WINDOW}</span>
              </div>
              <div className="flex justify-between">
                <span>Interval</span>
                <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>30 s</span>
              </div>
              <div className="flex justify-between">
                <span>Window</span>
                <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>~{Math.round(series.length * 0.5)} min</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Cluster Health */}
        <motion.div variants={fadeUp} initial="initial" animate="animate" transition={{ delay: 0.35 }}
          className={`rounded-xl p-5 border ${isDark ? 'bg-[#0d1220] border-white/[0.06]' : 'bg-white border-gray-200 shadow-sm'}`}
        >
          <h3 className={`text-sm font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>Cluster Health</h3>
          <div className="flex flex-col items-center gap-4">
            <HealthGauge score={healthScore} />
            <div className="w-full space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Nodes Ready</span></div>
                <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{readyNodes}/{nodes.length || '—'}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-400" /><span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Pods Running</span></div>
                <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{runningPods}/{pods.length}</span>
              </div>
              {failedPods > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-400" /><span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Pods Failed</span></div>
                  <span className="font-semibold text-red-400">{failedPods}</span>
                </div>
              )}
              {notReadyNodes > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-400" /><span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Nodes NotReady</span></div>
                  <span className="font-semibold text-red-400">{notReadyNodes}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-yellow-400" /><span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Deployments</span></div>
                <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{deployments.length}</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Pod Status Distribution */}
        <motion.div variants={fadeUp} initial="initial" animate="animate" transition={{ delay: 0.4 }}
          className={`rounded-xl p-5 border ${isDark ? 'bg-[#0d1220] border-white/[0.06]' : 'bg-white border-gray-200 shadow-sm'}`}
        >
          <h3 className={`text-sm font-semibold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>Pod Status</h3>
          <p className={`text-xs mb-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{pods.length} pods across {namespaces.length} namespaces</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={podPieData} cx="50%" cy="50%" innerRadius={48} outerRadius={76} dataKey="value" paddingAngle={3}>
                {podPieData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: isDark ? '#0d1220' : '#fff', border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-1">
            {podPieData.map((item, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                <span className={`text-[11px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{item.name} <span className="font-semibold">{item.value}</span></span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Pods by Namespace */}
        <motion.div variants={fadeUp} initial="initial" animate="animate" transition={{ delay: 0.45 }}
          className={`rounded-xl p-5 border ${isDark ? 'bg-[#0d1220] border-white/[0.06]' : 'bg-white border-gray-200 shadow-sm'}`}
        >
          <h3 className={`text-sm font-semibold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>Pods by Namespace</h3>
          <p className={`text-xs mb-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Running vs failed breakdown</p>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={nsResourceData} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1a2035' : '#f0f4f8'} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: isDark ? '#6b7280' : '#9ca3af' }} tickLine={false} axisLine={false} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: isDark ? '#6b7280' : '#9ca3af' }} width={95} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: isDark ? '#0d1220' : '#fff', border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }} />
              <Bar dataKey="running" name="Running" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} barSize={8} />
              <Bar dataKey="failed"  name="Failed"  stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={8} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* ── Bottom stat row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Cpu,       label: 'Ready Nodes',   value: `${readyNodes} / ${nodes.length || '—'}`,  color: 'text-blue-400',    bg: 'bg-blue-400/10',    delay: 0.5  },
          { icon: Layers,    label: 'Deployments',   value: deployments.length,                         color: 'text-cyan-400',    bg: 'bg-cyan-400/10',    delay: 0.55 },
          { icon: HardDrive, label: 'Total Pods',    value: pods.length,                                color: 'text-emerald-400', bg: 'bg-emerald-400/10', delay: 0.6  },
          { icon: Activity,  label: 'Total Events',  value: events.length,                              color: 'text-yellow-400',  bg: 'bg-yellow-400/10',  delay: 0.65 },
        ].map(({ icon: Icon, label, value, color, bg, delay }) => (
          <motion.div key={label} variants={fadeUp} initial="initial" animate="animate" transition={{ delay }}
            className={`rounded-xl p-4 border ${isDark ? 'bg-[#0d1220] border-white/[0.06]' : 'bg-white border-gray-200 shadow-sm'}`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${bg}`}><Icon size={18} className={color} /></div>
              <div>
                <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{label}</p>
                <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

    </div>
  );
}
