import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { ChevronDown, ChevronUp, AlertCircle, X, Loader2, Server, Zap } from 'lucide-react';
import { BACKEND_URL } from '../lib/api-client';

// ── Scale action definitions ───────────────────────────────────────────────────
// Each target has its own downCmds and upCmds arrays.
// Add as many commands as needed — they run sequentially in the backend.
// Replace the placeholder strings with your real oc / kubectl / shell commands.

type ScaleDirection = 'down' | 'up';

interface ScaleTarget {
  id: string;
  label: string;
  namespace: string;
  /** Commands executed when Scale Down is clicked — runs in order */
  downCmds: string[];
  /** Commands executed when Scale Up is clicked — runs in order */
  upCmds: string[];
}

const SCALE_TARGETS: ScaleTarget[] = [
  {
    id: 'ftm',
    label: 'FTM',
    namespace: 'ftm',
    downCmds: [
      'oc scale deployment/ftm-deployment --namespace=ftm --replicas=0',
      // add more commands here if needed
    ],
    upCmds: [
      'oc scale deployment/ftm-deployment --namespace=ftm --replicas=2',
      // add more commands here if needed
    ],
  },
  {
    id: 'sccm',
    label: 'SCCM',
    namespace: 'sccm',
    downCmds: [
      'oc scale deployment/sccm-deployment --namespace=sccm --replicas=0',
    ],
    upCmds: [
      'oc scale deployment/sccm-deployment --namespace=sccm --replicas=2',
    ],
  },
  {
    id: 'sfg',
    label: 'SFG',
    namespace: 'sfg',
    downCmds: [
      'oc scale deployment/sfg-deployment --namespace=sfg --replicas=0',
    ],
    upCmds: [
      'oc scale deployment/sfg-deployment --namespace=sfg --replicas=2',
    ],
  },
  {
    id: 'ftm-db',
    label: 'FTM-DB',
    namespace: 'ftm',
    downCmds: [
      'oc scale statefulset/ftm-db --namespace=ftm --replicas=0',
    ],
    upCmds: [
      'oc scale statefulset/ftm-db --namespace=ftm --replicas=1',
    ],
  },
  {
    id: 'dup-db',
    label: 'DUP-DB',
    namespace: 'dup',
    downCmds: [
      'oc scale statefulset/dup-db --namespace=dup --replicas=0',
    ],
    upCmds: [
      'oc scale statefulset/dup-db --namespace=dup --replicas=1',
    ],
  },
  {
    id: 'sccm-dm',
    label: 'SCCM-DM',
    namespace: 'sccm',
    downCmds: [
      'oc scale statefulset/sccm-dm --namespace=sccm --replicas=0',
    ],
    upCmds: [
      'oc scale statefulset/sccm-dm --namespace=sccm --replicas=1',
    ],
  },
  {
    id: 'sfg-db',
    label: 'SFG-DB',
    namespace: 'sfg',
    downCmds: [
      'oc scale statefulset/sfg-db --namespace=sfg --replicas=0',
    ],
    upCmds: [
      'oc scale statefulset/sfg-db --namespace=sfg --replicas=1',
    ],
  },
];

// ── Backend command runner ─────────────────────────────────────────────────────
// Calls your FastAPI /api/action/run-command endpoint once per command.
// The endpoint should accept { command: string } and return { output: string }.
// Commands for a single button run sequentially; output is concatenated.

async function runCommands(cmds: string[]): Promise<string> {
  const outputs: string[] = [];
  for (const cmd of cmds) {
    const res = await fetch(`${BACKEND_URL}/api/action/run-command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Command failed: ${cmd}\n${text}`);
    }
    const data = await res.json() as { output?: string };
    outputs.push(`$ ${cmd}\n${data.output ?? '(no output)'}`);
  }
  return outputs.join('\n\n');
}

// ── Confirmation modal ─────────────────────────────────────────────────────────

interface ConfirmModalProps {
  target: ScaleTarget;
  direction: ScaleDirection;
  onConfirm: () => void;
  onCancel: () => void;
  executing: boolean;
  result: string | null;
  error: string | null;
}

function ConfirmModal({ target, direction, onConfirm, onCancel, executing, result, error }: ConfirmModalProps) {
  const { isDark } = useTheme();
  const isDown = direction === 'down';
  const accentBg   = isDown ? 'bg-red-600/80'  : 'bg-emerald-700/80';
  const accentRing = isDown ? 'ring-red-600/20' : 'ring-emerald-700/20';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={!executing ? onCancel : undefined}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className={`relative w-full max-w-md rounded-2xl border shadow-2xl z-10 ${
          isDark ? 'bg-[#0d1220] border-white/[0.08]' : 'bg-white border-gray-200'
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-6 pt-6 pb-4 border-b ${isDark ? 'border-white/[0.06]' : 'border-gray-100'}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isDark ? 'bg-white/[0.05]' : 'bg-gray-100'}`}>
              <AlertCircle size={18} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
            </div>
            <div>
              <h3 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Confirm Scale {isDown ? 'Down' : 'Up'}
              </h3>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                {target.label} · namespace: {target.namespace}
              </p>
            </div>
          </div>
          {!executing && (
            <button onClick={onCancel} className={`p-1 rounded-lg transition-colors ${isDark ? 'hover:bg-white/[0.06] text-gray-500' : 'hover:bg-gray-100 text-gray-400'}`}>
              <X size={16} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-3">
          <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
            Scale <span className="font-semibold">{target.label}</span>{' '}
            <span className="font-semibold">{isDown ? 'down' : 'up'}</span>?{' '}
            {isDown
              ? 'This will stop all running pods for this service.'
              : 'This will bring the service pods back up.'}
          </p>

          {/* Output after execution */}
          {result && (
            <div className={`rounded-lg p-3 text-xs font-mono whitespace-pre-wrap leading-5 ${
              isDark ? 'bg-white/[0.04] text-gray-300 border border-white/[0.06]' : 'bg-gray-50 text-gray-700 border border-gray-200'
            }`}>{result}</div>
          )}
          {error && (
            <div className={`rounded-lg p-3 text-xs font-mono whitespace-pre-wrap leading-5 ${
              isDark ? 'bg-white/[0.04] text-gray-400 border border-white/[0.06]' : 'bg-gray-50 text-gray-600 border border-gray-200'
            }`}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 pb-6 pt-2">
          {!result && !error && (
            <>
              <button
                onClick={onCancel}
                disabled={executing}
                className={`px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-40 ${
                  isDark ? 'text-gray-400 hover:bg-white/[0.06]' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={executing}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white transition-all ring-2 ${accentRing} ${accentBg} hover:opacity-90 disabled:opacity-50`}
              >
                {executing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                {executing ? 'Running…' : `Scale ${isDown ? 'Down' : 'Up'}`}
              </button>
            </>
          )}
          {(result || error) && (
            <button
              onClick={onCancel}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                isDark ? 'bg-white/[0.06] text-gray-200 hover:bg-white/[0.10]' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Close
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ── Service action card ────────────────────────────────────────────────────────

interface ServiceActionCardProps {
  target: ScaleTarget;
  onAction: (target: ScaleTarget, direction: ScaleDirection) => void;
}

function ServiceActionCard({ target, onAction }: ServiceActionCardProps) {
  const { isDark } = useTheme();
  return (
    <div className={`rounded-xl border p-4 space-y-3 ${isDark ? 'bg-[#0d1220] border-white/[0.06]' : 'bg-white border-gray-200 shadow-sm'}`}>
      <div className="flex items-center gap-2">
        <div className={`p-1.5 rounded-lg ${isDark ? 'bg-white/[0.06]' : 'bg-gray-100'}`}>
          <Server size={14} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
        </div>
        <div>
          <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{target.label}</p>
          <p className={`text-[10px] ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>ns: {target.namespace}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onAction(target, 'down')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
            isDark
              ? 'border-white/[0.10] text-gray-400 hover:bg-white/[0.05] hover:border-white/[0.18]'
              : 'border-gray-300/70 text-gray-500 hover:bg-gray-100 hover:border-gray-400/70'
          }`}
        >
          <ChevronDown size={13} />
          Scale Down
        </button>
        <button
          onClick={() => onAction(target, 'up')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
            isDark
              ? 'border-white/[0.10] text-gray-400 hover:bg-white/[0.05] hover:border-white/[0.18]'
              : 'border-gray-300/70 text-gray-500 hover:bg-gray-100 hover:border-gray-400/70'
          }`}
        >
          <ChevronUp size={13} />
          Scale Up
        </button>
      </div>
    </div>
  );
}

// ── Actions page ───────────────────────────────────────────────────────────────

export default function Actions() {
  const { isDark } = useTheme();
  const [pending, setPending] = useState<{ target: ScaleTarget; direction: ScaleDirection } | null>(null);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function openConfirm(target: ScaleTarget, direction: ScaleDirection) {
    setPending({ target, direction });
    setResult(null);
    setActionError(null);
  }

  function closeConfirm() {
    if (executing) return;
    setPending(null);
    setResult(null);
    setActionError(null);
    setExecuting(false);
  }

  async function handleConfirm() {
    if (!pending) return;
    setExecuting(true);
    setResult(null);
    setActionError(null);
    const cmds = pending.direction === 'down'
      ? pending.target.downCmds
      : pending.target.upCmds;
    try {
      const output = await runCommands(cmds);
      setResult(output);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setExecuting(false);
    }
  }

  const appTargets = SCALE_TARGETS.filter(t => ['ftm', 'sccm', 'sfg'].includes(t.id));
  const dbTargets  = SCALE_TARGETS.filter(t => !['ftm', 'sccm', 'sfg'].includes(t.id));

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Actions</h1>
        <p className={`text-sm mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          Scale OpenShift deployments up or down
        </p>
      </div>

      {/* Application services */}
      <section>
        <h4 className={`text-xs font-semibold uppercase tracking-widest mb-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          Application Services
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {appTargets.map(target => (
            <ServiceActionCard key={target.id} target={target} onAction={openConfirm} />
          ))}
        </div>
      </section>

      {/* Database services */}
      <section>
        <h4 className={`text-xs font-semibold uppercase tracking-widest mb-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          Database Services
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {dbTargets.map(target => (
            <ServiceActionCard key={target.id} target={target} onAction={openConfirm} />
          ))}
        </div>
      </section>

      {/* Confirmation modal */}
      <AnimatePresence>
        {pending && (
          <ConfirmModal
            target={pending.target}
            direction={pending.direction}
            onConfirm={handleConfirm}
            onCancel={closeConfirm}
            executing={executing}
            result={result}
            error={actionError}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
