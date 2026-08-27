import { useTheme } from '../context/ThemeContext';
import { Bell, RefreshCw, Activity, Clock, KeyRound, AlertTriangle, CheckCircle, X, Eye, EyeOff } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { BACKEND_URL } from '../lib/api-client';

export default function Header() {
  const { isDark } = useTheme();
  const [time, setTime] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);

  // Token status
  const [tokenExpired, setTokenExpired] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [tokenVisible, setTokenVisible] = useState(false);
  const [tokenSaving, setTokenSaving] = useState(false);
  const [tokenMsg, setTokenMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Check token status on mount and every 5 minutes
  const checkToken = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/openshift/token-status`);
      if (!res.ok) return;
      const data = await res.json();
      setTokenExpired(data.status === 'expired');
    } catch { /* backend not reachable — ignore */ }
  }, []);

  useEffect(() => {
    checkToken();
    const id = setInterval(checkToken, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [checkToken]);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1500);
  };

  const openTokenModal = () => {
    setTokenInput('');
    setTokenMsg(null);
    setTokenVisible(false);
    setShowTokenModal(true);
  };

  const saveToken = async () => {
    const t = tokenInput.trim();
    if (!t.startsWith('sha256~')) {
      setTokenMsg({ ok: false, text: 'Token must start with sha256~' });
      return;
    }
    setTokenSaving(true);
    setTokenMsg(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/openshift/update-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: t }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTokenMsg({ ok: false, text: data.detail || `HTTP ${res.status}` });
      } else {
        setTokenMsg({ ok: true, text: data.message || 'Token updated successfully!' });
        setTokenExpired(false);
        // Close modal after short delay
        setTimeout(() => { setShowTokenModal(false); setTokenInput(''); }, 1500);
      }
    } catch (e) {
      setTokenMsg({ ok: false, text: e instanceof Error ? e.message : 'Request failed' });
    }
    setTokenSaving(false);
  };

  return (
    <>
      {/* ── Token-expired banner ─────────────────────────────────────────── */}
      {tokenExpired && (
        <div className="sticky top-0 z-40 flex items-center justify-between gap-3 px-5 py-2 bg-red-500/95 backdrop-blur text-white text-xs font-medium">
          <div className="flex items-center gap-2">
            <AlertTriangle size={13} className="flex-shrink-0" />
            <span>OpenShift token expired — scaling and live data will fail until you refresh it.</span>
          </div>
          <button
            onClick={openTokenModal}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-md bg-white/20 hover:bg-white/30 transition-colors font-semibold"
          >
            <KeyRound size={12} />
            Refresh Token
          </button>
        </div>
      )}

      {/* ── Main header ──────────────────────────────────────────────────── */}
      <header
        className={`sticky top-0 z-30 h-14 flex items-center justify-between px-6 border-b backdrop-blur-xl ${
          isDark
            ? 'bg-[#0a0e1a]/80 border-white/[0.06] text-white'
            : 'bg-white/80 border-gray-200 text-gray-900'
        }`}
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full animate-pulse ${tokenExpired ? 'bg-red-400' : 'bg-emerald-400'}`} />
            <span className={`text-xs font-medium ${tokenExpired ? (isDark ? 'text-red-400' : 'text-red-500') : (isDark ? 'text-emerald-400' : 'text-emerald-600')}`}>
              {tokenExpired ? 'Token Expired' : 'All Systems Operational'}
            </span>
          </div>
          <div className={`h-4 w-px ${isDark ? 'bg-white/10' : 'bg-gray-300'}`} />
          <div className={`flex items-center gap-1.5 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            <Clock size={13} />
            <span>{time.toLocaleTimeString()}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Token refresh button (always accessible) */}
          <button
            onClick={openTokenModal}
            title="Update OpenShift token"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tokenExpired
                ? 'bg-red-500 text-white hover:bg-red-600'
                : isDark
                  ? 'bg-white/[0.06] text-gray-400 hover:bg-white/10 hover:text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
            }`}
          >
            <KeyRound size={13} />
            {tokenExpired ? 'Refresh Token' : 'Token'}
          </button>

          <button
            onClick={handleRefresh}
            className={`p-2 rounded-lg transition-colors ${
              isDark ? 'hover:bg-white/[0.06] text-gray-400' : 'hover:bg-gray-100 text-gray-500'
            }`}
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>

          <button
            className={`relative p-2 rounded-lg transition-colors ${
              isDark ? 'hover:bg-white/[0.06] text-gray-400' : 'hover:bg-gray-100 text-gray-500'
            }`}
          >
            <Bell size={16} />
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
          </button>

          <div className={`h-6 w-px ${isDark ? 'bg-white/10' : 'bg-gray-300'}`} />

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
              <Activity size={14} className="text-white" />
            </div>
            <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>SRE Admin</span>
          </div>
        </div>
      </header>

      {/* ── Token update modal ───────────────────────────────────────────── */}
      {showTokenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className={`w-full max-w-lg rounded-2xl border shadow-2xl ${isDark ? 'bg-[#0d1220] border-white/[0.08]' : 'bg-white border-gray-200'}`}>
            {/* header */}
            <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? 'border-white/[0.06]' : 'border-gray-100'}`}>
              <div className="flex items-center gap-2">
                <KeyRound size={16} className="text-blue-400" />
                <h3 className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>Refresh OpenShift Token</h3>
              </div>
              <button onClick={() => setShowTokenModal(false)} className={isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}>
                <X size={16} />
              </button>
            </div>

            {/* body */}
            <div className="px-5 py-4 space-y-4 text-sm">
              <ol className={`space-y-1.5 text-xs leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                <li>1. Go to your <a href="https://console.apps.rm3.7wse.p1.openshiftapps.com" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">OpenShift Console</a></li>
                <li>2. Click your username (top-right) → <strong className={isDark ? 'text-gray-200' : 'text-gray-700'}>Copy login command</strong> → <strong className={isDark ? 'text-gray-200' : 'text-gray-700'}>Display Token</strong></li>
                <li>3. Copy the <code className="px-1 py-0.5 rounded bg-white/10 font-mono">sha256~…</code> token and paste it below</li>
              </ol>

              <div className={`relative flex items-center rounded-lg border ${isDark ? 'bg-white/[0.04] border-white/[0.08]' : 'bg-gray-50 border-gray-200'}`}>
                <input
                  type={tokenVisible ? 'text' : 'password'}
                  value={tokenInput}
                  onChange={e => setTokenInput(e.target.value)}
                  placeholder="sha256~..."
                  autoComplete="off"
                  className={`flex-1 bg-transparent px-3 py-2.5 text-xs font-mono outline-none ${isDark ? 'text-white placeholder-gray-600' : 'text-gray-900 placeholder-gray-400'}`}
                />
                <button
                  onClick={() => setTokenVisible(v => !v)}
                  className={`px-3 py-2.5 ${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  {tokenVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>

              {tokenMsg && (
                <div className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg border ${
                  tokenMsg.ok
                    ? isDark ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : isDark ? 'bg-red-400/10 text-red-400 border-red-400/20' : 'bg-red-50 text-red-600 border-red-200'
                }`}>
                  {tokenMsg.ok ? <CheckCircle size={12} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />}
                  {tokenMsg.text}
                </div>
              )}
            </div>

            {/* footer */}
            <div className={`flex items-center justify-end gap-2 px-5 py-4 border-t ${isDark ? 'border-white/[0.06]' : 'border-gray-100'}`}>
              <button
                onClick={() => setShowTokenModal(false)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isDark ? 'bg-white/[0.06] text-gray-300 hover:bg-white/10' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                Cancel
              </button>
              <button
                onClick={saveToken}
                disabled={tokenSaving || !tokenInput.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {tokenSaving ? <RefreshCw size={13} className="animate-spin" /> : <KeyRound size={13} />}
                {tokenSaving ? 'Applying…' : 'Apply Token'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
