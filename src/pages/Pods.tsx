import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { getPods, getNamespaces, getDeployments, type OCPod, type OCDeployment } from '../lib/openshift-direct';
import { getPodAge, getPodHealthStatus } from '../lib/openshift-direct';
import { BACKEND_URL } from '../lib/api-client';
import {
  Search, Filter, Layers, Container, AlertTriangle, CheckCircle,
  XCircle, Clock, RefreshCw, X, FileText, Terminal, ChevronDown, Copy, Check, ClipboardPaste,
  ChevronUp, Minus,
} from 'lucide-react';

// ─── types ────────────────────────────────────────────────────────────────────

type PanelMode = 'logs' | 'describe';

interface ScaleModal {
  pod: OCPod;
  /** inferred controller name to scale (e.g. "nginx", "nginx2") */
  controllerName: string;
  /** target replica count */
  replicas: number;
  direction: 'up' | 'down';
}

interface PodPanel {
  podName: string;
  namespace: string;
  mode: PanelMode;
  loading: boolean;
  content: string | null;
  error: string | null;
  /** container names from pod spec — populated when the panel is opened */
  containers: string[];
  /** how many tail lines were requested (logs only) */
  tailLines: number;
  /** user-pasted log content (used when token lacks pods/log permission) */
  pastedContent: string | null;
}

// ─── tiny copy-to-clipboard button ───────────────────────────────────────────

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  if (label) {
    return (
      <button
        onClick={copy}
        title="Copy all to clipboard"
        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex-shrink-0 ${
          copied
            ? 'bg-emerald-500/20 text-emerald-400'
            : 'bg-white/[0.06] text-gray-400 hover:bg-white/10 hover:text-white'
        }`}
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
        {copied ? 'Copied!' : label}
      </button>
    );
  }
  return (
    <button
      onClick={copy}
      title="Copy to clipboard"
      className="ml-1.5 p-0.5 rounded text-gray-400 hover:text-white transition-colors flex-shrink-0"
    >
      {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
    </button>
  );
}

// ─── component ────────────────────────────────────────────────────────────────

export default function Pods() {
  const { isDark } = useTheme();
  const [pods, setPods] = useState<OCPod[]>([]);
  const [deployments, setDeployments] = useState<OCDeployment[]>([]);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [nsFilter, setNsFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // panel state — one open panel at a time
  const [panel, setPanel] = useState<PodPanel | null>(null);
  // textarea value for the "paste logs" input inside the RBAC-denied panel
  const [pasteInput, setPasteInput] = useState('');
  // scale confirmation modal
  const [scaleModal, setScaleModal] = useState<ScaleModal | null>(null);
  const [scaleLoading, setScaleLoading] = useState(false);
  const [scaleResult, setScaleResult] = useState<{ success: boolean; message: string } | null>(null);
  // namespaces where the token can actually GET+PATCH deployments
  const [scalableNamespaces, setScalableNamespaces] = useState<Set<string>>(new Set());

  /** Probe each namespace — can we GET deployments there? */
  const probeScalableNamespaces = async (allNs: string[]) => {
    const results = await Promise.all(
      allNs.map(async ns => {
        try {
          const res = await fetch(`${BACKEND_URL}/api/openshift/deployment-replicas?name=__probe__&namespace=${encodeURIComponent(ns)}`);
          // 404 = no such deployment but we CAN read — that's fine, namespace is scalable
          // 403 = no permission — not scalable
          // We treat anything other than 403 as "has read access"
          if (res.status === 403) return null;
          return ns;
        } catch {
          return null;
        }
      })
    );
    setScalableNamespaces(new Set(results.filter(Boolean) as string[]));
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pd, ns, deps] = await Promise.all([getPods(), getNamespaces(), getDeployments()]);
      setPods(pd);
      setDeployments(deps);
      const nsFromPods = [...new Set(pd.map(p => p.metadata.namespace))];
      const nsFromApi  = ns.map(n => n.metadata.name);
      const allNs = [...new Set([...nsFromApi, ...nsFromPods])].sort();
      setNamespaces(allNs);
      // Fire permission probes in background — don't block the main render
      probeScalableNamespaces(allNs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // ── scale helpers ─────────────────────────────────────────────────────────

  /**
   * Derive the controller name from live owner references returned by the backend.
   * Returns { name, kind } or null if the pod is truly standalone (no owners at all).
   * For every recognised controller type the backend oc_scale will handle scaling.
   */
  const resolveControllerFromOwners = (
    owners: Array<{ kind: string; name: string }>
  ): { name: string; kind: string } | null => {
    // Direct Deployment
    const dep = owners.find(o => o.kind === 'Deployment');
    if (dep) return { name: dep.name, kind: 'Deployment' };

    // ReplicaSet → strip pod-template-hash → Deployment
    const rs = owners.find(o => o.kind === 'ReplicaSet');
    if (rs) {
      const parts = rs.name.split('-');
      if (parts.length >= 2 && /^[a-z0-9]{5,16}$/.test(parts[parts.length - 1]))
        return { name: parts.slice(0, -1).join('-'), kind: 'Deployment' };
      // Non-standard RS — use RS name directly; oc scale will figure it out
      return { name: rs.name, kind: 'ReplicaSet' };
    }

    // ReplicationController → strip numeric revision → DeploymentConfig
    const rc = owners.find(o => o.kind === 'ReplicationController');
    if (rc) {
      const m = rc.name.match(/^(.+)-\d+$/);
      return { name: m ? m[1] : rc.name, kind: 'DeploymentConfig' };
    }

    // StatefulSet — name is the owner name directly
    const ss = owners.find(o => o.kind === 'StatefulSet');
    if (ss) return { name: ss.name, kind: 'StatefulSet' };

    // Any other owner — use its name and let oc scale try
    if (owners.length > 0) return { name: owners[0].name, kind: owners[0].kind };

    return null; // no owners — truly standalone
  };

  const openScaleModal = async (pod: OCPod, direction: 'up' | 'down') => {
    setScaleResult(null);

    const ns = pod.metadata.namespace;
    if (!scalableNamespaces.has(ns)) {
      setScaleResult({ success: false, message: `No deployment access in namespace "${ns}" — read-only view` });
      return;
    }

    // Fetch live owner references from the backend
    let controllerName: string | null = null;
    try {
      const ownerRes = await fetch(
        `${BACKEND_URL}/api/openshift/pod-owner?pod_name=${encodeURIComponent(pod.metadata.name)}&namespace=${encodeURIComponent(ns)}`
      );
      if (ownerRes.ok) {
        const ownerData = await ownerRes.json();
        const owners: Array<{ kind: string; name: string }> = ownerData.ownerReferences || [];
        const resolved = resolveControllerFromOwners(owners);
        if (resolved) {
          controllerName = resolved.name;
        } else {
          // Truly standalone pod — no owners at all
          setScaleResult({
            success: false,
            message: `"${pod.metadata.name}" is a standalone pod with no controller. ` +
              `To scale, delete it and create a Deployment instead.`,
          });
          return;
        }
      }
    } catch { /* fall through to name-based guess */ }

    // Fallback: derive name from pod's cached ownerReferences
    if (!controllerName) {
      const owners = pod.metadata.ownerReferences || [];
      const resolved = resolveControllerFromOwners(owners);
      controllerName = resolved?.name ?? null;
    }

    // If still no controller — pod has no owners at all, nothing to scale
    if (!controllerName) {
      setScaleResult({
        success: false,
        message: `"${pod.metadata.name}" is a standalone pod with no controller.`,
      });
      return;
    }

    // Fetch current replica count to show ±1 in the confirmation
    let currentReplicas = 1;
    try {
      const repRes = await fetch(
        `${BACKEND_URL}/api/openshift/deployment-replicas?name=${encodeURIComponent(controllerName)}&namespace=${encodeURIComponent(ns)}`
      );
      if (repRes.ok) {
        const repData = await repRes.json();
        currentReplicas = repData.replicas ?? 1;
      }
    } catch { /* use default */ }

    const targetReplicas = direction === 'up' ? currentReplicas + 1 : Math.max(0, currentReplicas - 1);
    setScaleModal({ pod, controllerName, replicas: targetReplicas, direction });
  };

  const confirmScale = async () => {
    if (!scaleModal) return;
    setScaleLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/openshift/scale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: scaleModal.controllerName,
          namespace: scaleModal.pod.metadata.namespace,
          replicas: scaleModal.replicas,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail: string = data.detail || `HTTP ${res.status}`;
        // 401 = expired token — give an actionable message
        const msg = res.status === 401 || detail.includes('401')
          ? '⚠️ OpenShift token expired. Click the "Token" button in the header to paste a fresh token.'
          : detail;
        throw new Error(msg);
      }
      setScaleResult({ success: true, message: data.message });
      setScaleModal(null);
      setTimeout(() => fetchData(), 2000);
    } catch (err) {
      setScaleResult({ success: false, message: err instanceof Error ? err.message : 'Scale failed' });
      setScaleModal(null);
    }
    setScaleLoading(false);
  };

  // ── action handlers ──────────────────────────────────────────────────────

  /** Fetch logs or describe for a pod and populate the panel */
  const fetchPanel = async (
    podName: string,
    namespace: string,
    mode: PanelMode,
    containers: string[],
    tailLines: number,
  ) => {
    setPanel(p => p ? { ...p, loading: true, content: null, error: null } : p);
    try {
      const action = mode === 'logs' ? 'logs' : 'describe';
      const firstContainer = containers[0];
      const res = await fetch(`${BACKEND_URL}/api/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          kind: 'Pod',
          name: podName,
          namespace,
          ...(mode === 'logs' && firstContainer ? { container: firstContainer } : {}),
          ...(mode === 'logs' ? { tail_lines: tailLines } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
      if (data.success === false && data.result) {
        setPanel(p => p ? { ...p, loading: false, error: data.result } : p);
      } else {
        setPanel(p => p ? { ...p, loading: false, content: data.result || '(no output)' } : p);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setPanel(p => p ? { ...p, loading: false, error: msg } : p);
    }
  };

  const openPanel = async (pod: OCPod, mode: PanelMode) => {
    // toggle closed if same panel already open
    if (panel?.podName === pod.metadata.name && panel?.namespace === pod.metadata.namespace && panel?.mode === mode) {
      setPanel(null);
      return;
    }
    const podContainers = pod.spec.containers?.map(c => c.name) ?? [];
    const tailLines = 0;   // 0 = all lines (no cap)
    setPasteInput('');
    setPanel({ podName: pod.metadata.name, namespace: pod.metadata.namespace, mode, loading: true, content: null, error: null, containers: podContainers, tailLines, pastedContent: null });
    await fetchPanel(pod.metadata.name, pod.metadata.namespace, mode, podContainers, tailLines);
  };

  // ── helpers ──────────────────────────────────────────────────────────────

  const getPodStatus = (pod: OCPod): string => {
    const containerStatuses = pod.status.containerStatuses || [];
    if (containerStatuses.some(cs => { const w = cs.state as { waiting?: { reason: string } }; return w?.waiting?.reason === 'CrashLoopBackOff'; })) return 'CrashLoopBackOff';
    if (containerStatuses.some(cs => { const t = cs.state as { terminated?: { reason: string } }; return t?.terminated?.reason === 'OOMKilled'; })) return 'OOMKilled';
    if (containerStatuses.some(cs => { const w = cs.state as { waiting?: { reason: string } }; return w?.waiting?.reason === 'ImagePullBackOff'; })) return 'ImagePullBackOff';
    if (containerStatuses.some(cs => { const w = cs.state as { waiting?: { reason: string } }; return w?.waiting?.reason === 'ContainerCreating'; })) return 'ContainerCreating';
    return pod.status.phase;
  };

  const getRestartCount = (pod: OCPod): number =>
    pod.status.containerStatuses?.reduce((sum, cs) => sum + cs.restartCount, 0) || 0;

  // Deployments scaled to 0 — no pods exist for these, show them separately
  const zeroRepDeps = deployments.filter(d => {
    const desired = d.spec?.replicas ?? 0;
    const matchNs = nsFilter === 'all' || d.metadata.namespace === nsFilter;
    const matchSearch = d.metadata.name.toLowerCase().includes(search.toLowerCase());
    return desired === 0 && matchNs && matchSearch && scalableNamespaces.has(d.metadata.namespace);
  });

  // Build a map: "namespace/controllerName" → replica count for the Replicas column
  const replicaMap = new Map<string, number>();
  for (const d of deployments) {
    replicaMap.set(`${d.metadata.namespace}/${d.metadata.name}`, d.spec?.replicas ?? 0);
  }

  /** Get the replica count for the deployment that owns this pod */
  const getPodReplicas = (pod: OCPod): number | null => {
    const owners = pod.metadata.ownerReferences ?? [];
    const rs = owners.find(o => o.kind === 'ReplicaSet');
    if (rs) {
      const parts = rs.name.split('-');
      if (parts.length >= 2 && /^[a-z0-9]{5,16}$/.test(parts[parts.length - 1])) {
        const depName = parts.slice(0, -1).join('-');
        const key = `${pod.metadata.namespace}/${depName}`;
        if (replicaMap.has(key)) return replicaMap.get(key)!;
      }
    }
    const dep = owners.find(o => o.kind === 'Deployment');
    if (dep) return replicaMap.get(`${pod.metadata.namespace}/${dep.name}`) ?? null;
    return null;
  };

  const filtered = pods.filter(p => {
    const matchNs     = nsFilter === 'all' || p.metadata.namespace === nsFilter;
    const matchSearch = p.metadata.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || getPodStatus(p) === statusFilter;
    return matchNs && matchSearch && matchStatus;
  });

  const activeFilters = (nsFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0) + (search ? 1 : 0);

  const statusIcon = (status: string) => {
    switch (status) {
      case 'Running':          return <CheckCircle   size={14} className="text-emerald-400" />;
      case 'CrashLoopBackOff': return <XCircle       size={14} className="text-red-400" />;
      case 'OOMKilled':        return <AlertTriangle size={14} className="text-red-400" />;
      case 'ImagePullBackOff': return <XCircle       size={14} className="text-orange-400" />;
      case 'Pending':          return <Clock         size={14} className="text-blue-400" />;
      case 'Succeeded':        return <CheckCircle   size={14} className="text-gray-400" />;
      default:                 return <Container     size={14} className="text-gray-400" />;
    }
  };

  const statusBg = (status: string) => {
    switch (status) {
      case 'Running':          return 'text-emerald-400 bg-emerald-400/10';
      case 'CrashLoopBackOff': return 'text-red-400 bg-red-400/10';
      case 'OOMKilled':        return 'text-red-400 bg-red-400/10';
      case 'ImagePullBackOff': return 'text-orange-400 bg-orange-400/10';
      case 'Pending':          return 'text-blue-400 bg-blue-400/10';
      case 'Succeeded':        return 'text-gray-400 bg-gray-400/10';
      default:                 return 'text-gray-400 bg-gray-400/10';
    }
  };

  const healthColor = (health: string) => {
    if (health === 'healthy') return 'text-emerald-400';
    if (health === 'warning') return 'text-yellow-400';
    return 'text-red-400';
  };

  const uniqueStatuses = [...new Set(pods.map(p => getPodStatus(p)))].sort();
  const nsPodCount     = (ns: string) => pods.filter(p => p.metadata.namespace === ns).length;
  const runningCount   = pods.filter(p => getPodStatus(p) === 'Running').length;
  const crashLoopCount = pods.filter(p => getPodStatus(p) === 'CrashLoopBackOff').length;
  const oomCount       = pods.filter(p => getPodStatus(p) === 'OOMKilled').length;
  const pendingCount   = pods.filter(p => getPodStatus(p) === 'Pending').length;
  const highRestartCount = pods.filter(p => getRestartCount(p) > 5).length;

  // ── loading / error screens ──────────────────────────────────────────────

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

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Pod Monitoring</h1>
          <p className={`text-sm mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            {pods.length} pods across {namespaces.length} namespace{namespaces.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={fetchData} className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-white/[0.06] text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: 'Total',        value: pods.length,      color: 'text-blue-400' },
          { label: 'Running',      value: runningCount,     color: 'text-emerald-400' },
          { label: 'CrashLoop',    value: crashLoopCount,   color: 'text-red-400' },
          { label: 'OOMKilled',    value: oomCount,         color: 'text-red-400' },
          { label: 'Pending',      value: pendingCount,     color: 'text-blue-400' },
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
      <div className={`rounded-xl border p-4 ${isDark ? 'bg-[#0d1220] border-white/[0.06]' : 'bg-white border-gray-200 shadow-sm'}`}>
        <div className="flex flex-wrap items-center gap-3">

          {/* Search */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg flex-1 min-w-[180px] ${isDark ? 'bg-white/[0.04] border border-white/[0.06]' : 'bg-gray-50 border border-gray-200'}`}>
            <Search size={14} className={isDark ? 'text-gray-500' : 'text-gray-400'} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search pod name…"
              className={`bg-transparent text-sm outline-none flex-1 ${isDark ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'}`}
            />
            {search && (
              <button onClick={() => setSearch('')} className={isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}>
                <X size={12} />
              </button>
            )}
          </div>

          {/* Namespace filter */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isDark ? 'bg-white/[0.04] border border-white/[0.06]' : 'bg-gray-50 border border-gray-200'}`}>
            <Layers size={14} className={nsFilter !== 'all' ? 'text-blue-400' : (isDark ? 'text-gray-500' : 'text-gray-400')} />
            <select
              value={nsFilter}
              onChange={e => setNsFilter(e.target.value)}
              className={`bg-transparent text-sm outline-none cursor-pointer ${isDark ? 'text-gray-300' : 'text-gray-700'}`}
            >
              <option value="all">All Namespaces ({namespaces.length})</option>
              {namespaces.map(ns => (
                <option key={ns} value={ns}>{ns}  ({nsPodCount(ns)} pods)</option>
              ))}
            </select>
          </div>

          {/* Status filter */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isDark ? 'bg-white/[0.04] border border-white/[0.06]' : 'bg-gray-50 border border-gray-200'}`}>
            <Filter size={14} className={statusFilter !== 'all' ? 'text-blue-400' : (isDark ? 'text-gray-500' : 'text-gray-400')} />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className={`bg-transparent text-sm outline-none cursor-pointer ${isDark ? 'text-gray-300' : 'text-gray-700'}`}
            >
              <option value="all">All Status</option>
              {uniqueStatuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Clear all filters */}
          {activeFilters > 0 && (
            <button
              onClick={() => { setSearch(''); setNsFilter('all'); setStatusFilter('all'); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${isDark ? 'bg-red-400/10 text-red-400 hover:bg-red-400/20' : 'bg-red-50 text-red-500 hover:bg-red-100'}`}
            >
              <X size={12} />
              Clear {activeFilters} filter{activeFilters > 1 ? 's' : ''}
            </button>
          )}
        </div>

        {/* Active filter chips + result count */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            Showing <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{filtered.length}</span> of <span className="font-semibold">{pods.length}</span> pods
          </span>
          {nsFilter !== 'all' && (
            <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${isDark ? 'bg-blue-400/10 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
              <Layers size={10} /> {nsFilter}
              <button onClick={() => setNsFilter('all')} className="ml-0.5 hover:opacity-70"><X size={10} /></button>
            </span>
          )}
          {statusFilter !== 'all' && (
            <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${isDark ? 'bg-purple-400/10 text-purple-400' : 'bg-purple-50 text-purple-600'}`}>
              <Filter size={10} /> {statusFilter}
              <button onClick={() => setStatusFilter('all')} className="ml-0.5 hover:opacity-70"><X size={10} /></button>
            </span>
          )}
          {search && (
            <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${isDark ? 'bg-yellow-400/10 text-yellow-400' : 'bg-yellow-50 text-yellow-600'}`}>
              <Search size={10} /> "{search}"
              <button onClick={() => setSearch('')} className="ml-0.5 hover:opacity-70"><X size={10} /></button>
            </span>
          )}
        </div>
      </div>

      {/* Pod table */}
      <div className={`rounded-xl border overflow-hidden ${isDark ? 'bg-[#0d1220] border-white/[0.06]' : 'bg-white border-gray-200 shadow-sm'}`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className={`border-b ${isDark ? 'border-white/[0.06]' : 'border-gray-200'}`}>
                {['Pod', 'Namespace', 'Status', 'Replicas', 'Restarts', 'Node', 'Age', 'Health', 'Actions'].map(h => (
                  <th key={h} className={`px-4 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>

              {/* ── zero-replica deployments (scaled down, no pods) ── */}
              {zeroRepDeps.map(dep => (
                <tr
                  key={`zero-${dep.metadata.uid}`}
                  className={`border-b ${isDark ? 'border-white/[0.03] bg-yellow-400/[0.03]' : 'border-gray-100 bg-yellow-50/60'}`}
                >
                  {/* Name */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Minus size={14} className="text-yellow-400 flex-shrink-0" />
                      <span className={`text-sm font-medium truncate max-w-[200px] ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {dep.metadata.name}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${isDark ? 'bg-yellow-400/10 text-yellow-400' : 'bg-yellow-100 text-yellow-700'}`}>
                        Deployment
                      </span>
                    </div>
                  </td>
                  {/* Namespace */}
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${isDark ? 'bg-white/[0.06] text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                      {dep.metadata.namespace}
                    </span>
                  </td>
                  {/* Status */}
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium text-yellow-400 bg-yellow-400/10">
                      Scaled Down
                    </span>
                  </td>
                  {/* Replicas */}
                  <td className="px-4 py-3">
                    <span className="text-sm font-bold text-yellow-400">0</span>
                  </td>
                  {/* Restarts */}
                  <td className="px-4 py-3"><span className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-300'}`}>—</span></td>
                  {/* Node */}
                  <td className="px-4 py-3"><span className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-300'}`}>—</span></td>
                  {/* Age */}
                  <td className="px-4 py-3">
                    <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {getPodAge(dep.metadata.creationTimestamp)}
                    </span>
                  </td>
                  {/* Health */}
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium text-yellow-400">scaled-down</span>
                  </td>
                  {/* Actions — Scale Up only */}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => {
                        const fakePod = {
                          metadata: {
                            name: dep.metadata.name,
                            namespace: dep.metadata.namespace,
                            uid: dep.metadata.uid,
                            creationTimestamp: dep.metadata.creationTimestamp,
                            ownerReferences: [{ kind: 'Deployment', name: dep.metadata.name, uid: dep.metadata.uid }],
                          },
                          spec: { containers: [] },
                          status: { phase: 'Unknown', containerStatuses: [] },
                        } as OCPod;
                        openScaleModal(fakePod, 'up');
                      }}
                      title="Scale up (+1 replica)"
                      className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        isDark ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                      }`}
                    >
                      <ChevronUp size={11} />
                      Scale Up
                    </button>
                  </td>
                </tr>
              ))}

              {/* ── regular pod rows ── */}
              {filtered.slice(0, 100).map((pod, i) => {
                const status   = getPodStatus(pod);
                const restarts = getRestartCount(pod);
                const health   = getPodHealthStatus(pod);
                const age      = getPodAge(pod.metadata.creationTimestamp);
                const replicas = getPodReplicas(pod);
                const isActive = panel?.podName === pod.metadata.name && panel?.namespace === pod.metadata.namespace;

                return (
                  <>
                    {/* ── pod row ── */}
                    <motion.tr
                      key={pod.metadata.uid || i}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.01 }}
                      className={`border-b transition-colors ${
                        isActive
                          ? (isDark ? 'bg-white/[0.04] border-white/[0.06]' : 'bg-blue-50/60 border-gray-200')
                          : (isDark ? 'border-white/[0.03] hover:bg-white/[0.02]' : 'border-gray-100 hover:bg-gray-50')
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {statusIcon(status)}
                          <span className={`text-sm font-medium truncate max-w-[200px] ${isDark ? 'text-white' : 'text-gray-900'}`}>{pod.metadata.name}</span>
                          {isActive && <ChevronDown size={12} className={isDark ? 'text-blue-400' : 'text-blue-500'} />}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded ${isDark ? 'bg-white/[0.06] text-gray-300' : 'bg-gray-100 text-gray-600'}`}>{pod.metadata.namespace}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBg(status)}`}>{status}</span>
                      </td>
                      {/* Replicas */}
                      <td className="px-4 py-3">
                        {replicas !== null
                          ? <span className={`text-sm font-medium ${replicas === 0 ? 'text-yellow-400' : 'text-gray-300'}`}>{replicas}</span>
                          : <span className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-300'}`}>—</span>
                        }
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

                      {/* ── action buttons ── */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {/* Describe */}
                          <button
                            onClick={() => openPanel(pod, 'describe')}
                            title="Describe pod"
                            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              isActive && panel?.mode === 'describe'
                                ? 'bg-violet-500 text-white'
                                : isDark
                                  ? 'bg-violet-500/10 text-violet-400 hover:bg-violet-500/20'
                                  : 'bg-violet-50 text-violet-600 hover:bg-violet-100'
                            }`}
                          >
                            <FileText size={11} />
                            Describe
                          </button>

                          {/* Logs */}
                          <button
                            onClick={() => openPanel(pod, 'logs')}
                            title="View pod logs"
                            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              isActive && panel?.mode === 'logs'
                                ? 'bg-emerald-500 text-white'
                                : isDark
                                  ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                                  : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                            }`}
                          >
                            <Terminal size={11} />
                            Logs
                          </button>

                          {/* Scale Up / Scale Down — disabled for standalone pods */}
                          {(() => {
                            const nsScalable = scalableNamespaces.has(pod.metadata.namespace);
                            const hasController = (pod.metadata.ownerReferences ?? []).length > 0;
                            const canScale = nsScalable && hasController;
                            const disabledTitle = !nsScalable
                              ? `No deployment access in namespace "${pod.metadata.namespace}"`
                              : 'Standalone pod — no controller to scale';
                            const disabledCls = isDark
                              ? 'bg-white/[0.03] text-gray-600 cursor-not-allowed'
                              : 'bg-gray-100 text-gray-400 cursor-not-allowed';
                            return (
                              <>
                                <button
                                  onClick={() => canScale && openScaleModal(pod, 'up')}
                                  disabled={!canScale}
                                  title={canScale ? 'Scale up (+1 replica)' : disabledTitle}
                                  className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                    canScale
                                      ? isDark ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                      : disabledCls
                                  }`}
                                >
                                  <ChevronUp size={11} />
                                  Scale Up
                                </button>
                                <button
                                  onClick={() => canScale && openScaleModal(pod, 'down')}
                                  disabled={!canScale}
                                  title={canScale ? 'Scale down (-1 replica)' : disabledTitle}
                                  className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                    canScale
                                      ? isDark ? 'bg-orange-500/10 text-orange-400 hover:bg-orange-500/20' : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                                      : disabledCls
                                  }`}
                                >
                                  <Minus size={11} />
                                  Scale Down
                                </button>
                              </>
                            );
                          })()}
                        </div>
                      </td>
                    </motion.tr>

                    {/* ── inline output panel ── */}
                    <AnimatePresence>
                      {isActive && (
                        <motion.tr
                          key={`panel-${pod.metadata.uid || i}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          <td colSpan={8} className={`px-0 border-b ${isDark ? 'border-white/[0.06]' : 'border-gray-200'}`}>
                            <motion.div
                              initial={{ height: 0 }}
                              animate={{ height: 'auto' }}
                              exit={{ height: 0 }}
                              transition={{ duration: 0.2 }}
                              style={{ overflow: 'hidden' }}
                            >
                              <div className={`mx-4 my-3 rounded-xl border overflow-hidden ${isDark ? 'bg-[#060d1a] border-white/[0.08]' : 'bg-gray-950 border-gray-700'}`}>

                                {/* panel header */}
                                <div className={`flex items-center justify-between px-4 py-2.5 border-b ${isDark ? 'border-white/[0.06]' : 'border-gray-700'}`}>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {panel?.mode === 'logs'
                                      ? <Terminal size={13} className="text-emerald-400" />
                                      : <FileText  size={13} className="text-violet-400" />
                                    }
                                    <span className="text-xs font-semibold text-white">
                                      {panel?.mode === 'logs' ? 'Logs' : 'Describe'} — {pod.metadata.name}
                                    </span>
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${isDark ? 'bg-white/[0.06] text-gray-400' : 'bg-gray-700 text-gray-300'}`}>
                                      {pod.metadata.namespace}
                                    </span>
                                    {/* line count badge */}
                                    {panel?.mode === 'logs' && !panel.loading && (() => {
                                      const raw = panel.content?.startsWith('[previous container logs]')
                                        ? panel.content.replace('[previous container logs]\n', '')
                                        : panel.content;
                                      const src = raw || panel.pastedContent;
                                      if (!src) return null;
                                      const count = src.split('\n').length;
                                      return (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">
                                          {count} line{count !== 1 ? 's' : ''}
                                        </span>
                                      );
                                    })()}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {/* tail-lines selector — logs only */}
                                    {panel?.mode === 'logs' && (
                                      <select
                                        value={panel.tailLines}
                                        onChange={e => {
                                          const tl = Number(e.target.value);
                                          setPanel(p => p ? { ...p, tailLines: tl } : p);
                                          if (panel) fetchPanel(panel.podName, panel.namespace, 'logs', panel.containers, tl);
                                        }}
                                        className="bg-white/[0.06] border border-white/10 text-gray-300 text-[11px] rounded px-1.5 py-0.5 outline-none cursor-pointer"
                                        title="Number of log lines to fetch"
                                      >
                                        <option value={100}>Last 100 lines</option>
                                        <option value={500}>Last 500 lines</option>
                                        <option value={1000}>Last 1000 lines</option>
                                        <option value={0}>All lines</option>
                                      </select>
                                    )}
                                    {/* copy all logs button — content or pasted content */}
                                    {panel?.mode === 'logs' && !panel.loading && (() => {
                                      const raw = panel.content?.startsWith('[previous container logs]')
                                        ? panel.content.replace('[previous container logs]\n', '')
                                        : panel.content;
                                      const copyText = raw || panel.pastedContent;
                                      if (!copyText) return null;
                                      return <CopyBtn text={copyText} label="Copy all" />;
                                    })()}
                                    {/* copy all describe button */}
                                    {panel?.mode === 'describe' && panel?.content && !panel.loading && (
                                      <CopyBtn text={panel.content} label="Copy all" />
                                    )}
                                    <button
                                      onClick={() => setPanel(null)}
                                      className="text-gray-500 hover:text-gray-300 transition-colors"
                                    >
                                      <X size={14} />
                                    </button>
                                  </div>
                                </div>

                                {/* panel body */}
                                <div className="px-4 py-3 max-h-[70vh] overflow-y-auto">
                                  {panel?.loading && (
                                    <div className="flex items-center gap-2 text-gray-400 text-xs py-4">
                                      <RefreshCw size={13} className="animate-spin" />
                                      Loading {panel.mode}…
                                    </div>
                                  )}
                                  {panel?.error && (() => {
                                    const isRbac = panel.error.includes('pods/log') || panel.error.includes('To fix:') || panel.error.includes('not accessible');
                                    if (isRbac) {
                                      const ctrs = panel.containers.length > 0 ? panel.containers : ['<container>'];
                                      return (
                                        <div className="space-y-3 text-xs">
                                          {/* header */}
                                          <div className="flex items-center gap-1.5 text-yellow-400 font-semibold">
                                            <AlertTriangle size={13} />
                                            Logs not accessible — read permission denied on <code className="bg-white/10 px-1 rounded">pods/log</code> in <code className="bg-white/10 px-1 rounded">{panel.namespace}</code>
                                          </div>

                                          {/* oc login hint */}
                                          <p className="text-gray-400 leading-relaxed">
                                            The dashboard token does not have <code className="bg-white/10 px-1 rounded">get pods/log</code> in this shared namespace. Run the commands below in your terminal to stream logs directly:
                                          </p>

                                          {/* copyable oc log command per container */}
                                          <div className="space-y-1.5">
                                            {ctrs.map(ctr => {
                                              const tailArg = panel.tailLines > 0 ? ` --tail=${panel.tailLines}` : '';
                                              const cmd = `oc logs ${panel.podName} -n ${panel.namespace} -c ${ctr}${tailArg}`;
                                              return (
                                                <div key={ctr} className="flex items-center gap-2 bg-black/40 border border-white/10 rounded px-3 py-2">
                                                  <Terminal size={11} className="text-emerald-400 flex-shrink-0" />
                                                  <code className="flex-1 text-emerald-300 font-mono break-all">{cmd}</code>
                                                  <CopyBtn text={cmd} />
                                                </div>
                                              );
                                            })}
                                          </div>

                                          {/* follow flag tip */}
                                          <p className="text-gray-500">
                                            Add <code className="bg-white/10 px-1 rounded">-f</code> to follow live. Add <code className="bg-white/10 px-1 rounded">--previous</code> to see the last crashed container's output.
                                          </p>

                                          {/* RBAC grant hint */}
                                          <details className="group">
                                            <summary className="cursor-pointer text-gray-500 hover:text-gray-300 transition-colors list-none flex items-center gap-1">
                                              <span className="text-[10px] border border-white/10 rounded px-1.5 py-0.5">Need permanent access?</span>
                                            </summary>
                                            <div className="mt-2 bg-black/40 border border-white/10 rounded px-3 py-2 space-y-1.5">
                                              <p className="text-gray-400">Ask a cluster admin to run:</p>
                                              {(() => {
                                                const rbacCmd = `oc policy add-role-to-user view $(oc whoami) -n ${panel.namespace}`;
                                                return (
                                                  <div className="flex items-center gap-2">
                                                    <code className="flex-1 text-blue-300 font-mono break-all">{rbacCmd}</code>
                                                    <CopyBtn text={rbacCmd} />
                                                  </div>
                                                );
                                              })()}
                                            </div>
                                          </details>

                                          {/* ── paste-logs section ── */}
                                          <div className="border-t border-white/[0.06] pt-3 space-y-2">
                                            <p className="text-gray-400 flex items-center gap-1.5">
                                              <ClipboardPaste size={12} />
                                              Ran the command? Paste the output below to view it here:
                                            </p>
                                            <textarea
                                              value={pasteInput}
                                              onChange={e => setPasteInput(e.target.value)}
                                              placeholder="Paste log output here…"
                                              rows={5}
                                              className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-xs text-gray-200 font-mono outline-none resize-y placeholder-gray-600 focus:border-emerald-500/40"
                                            />
                                            <div className="flex items-center gap-2">
                                              <button
                                                disabled={!pasteInput.trim()}
                                                onClick={() => {
                                                  setPanel(p => p ? { ...p, pastedContent: pasteInput.trim(), error: null } : p);
                                                }}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[11px] font-medium"
                                              >
                                                <Terminal size={11} />
                                                View logs
                                              </button>
                                              {panel.pastedContent && (
                                                <button
                                                  onClick={() => {
                                                    setPanel(p => p ? { ...p, pastedContent: null } : p);
                                                    setPasteInput('');
                                                  }}
                                                  className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
                                                >
                                                  Clear
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    }
                                    return (
                                      <div className="flex items-start gap-2 text-red-400 text-xs py-2">
                                        <XCircle size={13} className="mt-0.5 flex-shrink-0" />
                                        <span>{panel.error}</span>
                                      </div>
                                    );
                                  })()}
                                  {/* pasted log content (shown after user pastes from terminal) */}
                                  {panel?.pastedContent && !panel.loading && (
                                    <>
                                      <div className="flex items-center justify-between mb-2 mt-1">
                                        <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                                          <ClipboardPaste size={11} />
                                          Pasted log output — {panel.pastedContent.split('\n').length} lines
                                        </div>
                                        <CopyBtn text={panel.pastedContent} label="Copy all" />
                                      </div>
                                      <pre className="text-xs text-gray-200 font-mono leading-relaxed whitespace-pre-wrap break-words">
                                        {panel.pastedContent}
                                      </pre>
                                    </>
                                  )}
                                  {panel?.content && !panel.loading && (() => {
                                    const isPrevious = panel.content!.startsWith('[previous container logs]');
                                    const displayContent = isPrevious
                                      ? panel.content!.replace('[previous container logs]\n', '')
                                      : panel.content!;
                                    return (
                                      <>
                                        {isPrevious && (
                                          <div className="flex items-center gap-1.5 mb-2 text-yellow-400 text-xs font-medium">
                                            <AlertTriangle size={11} />
                                            Showing logs from previous (crashed) container
                                          </div>
                                        )}
                                        {displayContent === '(no output)' || displayContent.trim() === '' ? (
                                          <p className="text-xs text-gray-500 italic py-2">(no log output)</p>
                                        ) : (
                                          <pre className="text-xs text-gray-200 font-mono leading-relaxed whitespace-pre-wrap break-words">
                                            {displayContent}
                                          </pre>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
                              </div>
                            </motion.div>
                          </td>
                        </motion.tr>
                      )}
                    </AnimatePresence>
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Scale result toast ── */}
      <AnimatePresence>
        {scaleResult && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-6 z-50 max-w-sm"
          >
            <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-xl text-sm ${
              scaleResult.success
                ? (isDark ? 'bg-[#0d1220] border-emerald-500/30 text-emerald-400' : 'bg-white border-emerald-300 text-emerald-700')
                : (isDark ? 'bg-[#0d1220] border-red-500/30 text-red-400' : 'bg-white border-red-300 text-red-600')
            }`}>
              {scaleResult.success
                ? <CheckCircle size={16} className="mt-0.5 flex-shrink-0" />
                : <XCircle size={16} className="mt-0.5 flex-shrink-0" />
              }
              <span className="flex-1">{scaleResult.message}</span>
              <button onClick={() => setScaleResult(null)} className="text-gray-400 hover:text-white ml-1">
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Scale confirmation modal ── */}
      <AnimatePresence>
        {scaleModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className={`w-full max-w-md rounded-2xl border shadow-2xl ${isDark ? 'bg-[#0d1220] border-white/[0.08]' : 'bg-white border-gray-200'}`}
            >
              {/* modal header */}
              <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? 'border-white/[0.06]' : 'border-gray-100'}`}>
                <div className="flex items-center gap-2">
                  {scaleModal.direction === 'up'
                    ? <ChevronUp size={18} className="text-blue-400" />
                    : <Minus size={18} className="text-orange-400" />
                  }
                  <h3 className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Confirm Scale {scaleModal.direction === 'up' ? 'Up' : 'Down'}
                  </h3>
                </div>
                <button onClick={() => setScaleModal(null)} className={`${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}>
                  <X size={16} />
                </button>
              </div>

              {/* modal body */}
              <div className="px-5 py-4 space-y-3 text-sm">
                {/* command preview */}
                <p className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Command that will run:</p>
                <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border font-mono text-xs overflow-x-auto ${isDark ? 'bg-black/40 border-white/[0.08] text-emerald-300' : 'bg-gray-950 border-gray-700 text-emerald-400'}`}>
                  <Terminal size={12} className="flex-shrink-0 text-emerald-500" />
                  <span>
                    oc scale deployment {scaleModal.controllerName} --replicas={scaleModal.replicas} -n {scaleModal.pod.metadata.namespace}
                  </span>
                  <CopyBtn text={`oc scale deployment ${scaleModal.controllerName} --replicas=${scaleModal.replicas} -n ${scaleModal.pod.metadata.namespace}`} />
                </div>
                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  The backend auto-detects the resource type (Deployment / DeploymentConfig / ReplicationController).
                </p>
                {scaleModal.direction === 'down' && (
                  <div className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg ${isDark ? 'bg-orange-400/10 text-orange-400 border border-orange-400/20' : 'bg-orange-50 text-orange-600 border border-orange-200'}`}>
                    <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                    Scaling down will terminate one running pod. Minimum 0 replicas.
                  </div>
                )}
              </div>

              {/* modal footer */}
              <div className={`flex items-center justify-end gap-2 px-5 py-4 border-t ${isDark ? 'border-white/[0.06]' : 'border-gray-100'}`}>
                <button
                  onClick={() => setScaleModal(null)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isDark ? 'bg-white/[0.06] text-gray-300 hover:bg-white/10' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmScale}
                  disabled={scaleLoading}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                    scaleModal.direction === 'up'
                      ? 'bg-blue-500 hover:bg-blue-600 text-white'
                      : 'bg-orange-500 hover:bg-orange-600 text-white'
                  }`}
                >
                  {scaleLoading
                    ? <RefreshCw size={13} className="animate-spin" />
                    : scaleModal.direction === 'up'
                      ? <ChevronUp size={13} />
                      : <Minus size={13} />
                  }
                  {scaleLoading
                    ? 'Scaling…'
                    : scaleModal.direction === 'up'
                      ? `Scale Up → ${scaleModal.replicas} replica${scaleModal.replicas !== 1 ? 's' : ''}`
                      : `Scale Down → ${scaleModal.replicas} replica${scaleModal.replicas !== 1 ? 's' : ''}`
                  }
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
