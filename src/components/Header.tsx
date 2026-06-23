import { useTheme } from '../context/ThemeContext';
import { Bell, RefreshCw, Activity, Clock } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function Header() {
  const { isDark } = useTheme();
  const [time, setTime] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1500);
  };

  return (
    <header
      className={`sticky top-0 z-30 h-14 flex items-center justify-between px-6 border-b backdrop-blur-xl ${
        isDark
          ? 'bg-[#0a0e1a]/80 border-white/[0.06] text-white'
          : 'bg-white/80 border-gray-200 text-gray-900'
      }`}
    >
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className={`text-xs font-medium ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
            All Systems Operational
          </span>
        </div>
        <div className={`h-4 w-px ${isDark ? 'bg-white/10' : 'bg-gray-300'}`} />
        <div className={`flex items-center gap-1.5 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          <Clock size={13} />
          <span>{time.toLocaleTimeString()}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
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
  );
}
