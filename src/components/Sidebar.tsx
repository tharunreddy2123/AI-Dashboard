import { NavLink } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import {
  LayoutDashboard,
  Boxes,
  Container,
  Rocket,
  Server,
  Zap,
  FileText,
  Bot,
  Bell,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  Search,
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/namespaces', icon: Boxes, label: 'Namespaces' },
  { to: '/pods', icon: Container, label: 'Pods' },
  { to: '/deployments', icon: Rocket, label: 'Deployments' },
  { to: '/nodes', icon: Server, label: 'Nodes' },
  { to: '/actions', icon: Zap, label: 'Actions' },
  { to: '/logs', icon: FileText, label: 'Logs' },
  { to: '/alerts', icon: Bell, label: 'Alerts' },
];

export default function Sidebar() {
  const { isDark, toggle } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <aside
      className={`fixed left-0 top-0 h-screen z-40 flex flex-col transition-all duration-300 ${
        collapsed ? 'w-[68px]' : 'w-[240px]'
      } ${isDark ? 'bg-[#0a0e1a] border-r border-white/[0.06]' : 'bg-white border-r border-gray-200'}`}
    >
      {/* Logo */}
      <div className={`flex items-center h-16 px-4 ${collapsed ? 'justify-center' : 'gap-3'}`}>
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center flex-shrink-0">
          <Bot size={20} className="text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className={`text-sm font-bold tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Tharun AI Ops
            </h1>
            <p className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Intelligent Operations</p>
          </div>
        )}
      </div>

      {/* Search */}
      {!collapsed && (
        <div className="px-3 mb-2">
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
              isDark ? 'bg-white/[0.04] text-gray-400 hover:bg-white/[0.08]' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            <Search size={14} />
            <span>Search...</span>
            <kbd className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-white/[0.06]' : 'bg-gray-200'}`}>
              /
            </kbd>
          </button>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 group ${
                isActive
                  ? isDark
                    ? 'bg-blue-500/10 text-blue-400'
                    : 'bg-blue-50 text-blue-600'
                  : isDark
                    ? 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              } ${collapsed ? 'justify-center' : ''}`
            }
          >
            <Icon size={18} className="flex-shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Bottom */}
      <div className={`px-3 py-4 space-y-2 border-t ${isDark ? 'border-white/[0.06]' : 'border-gray-200'}`}>
        <button
          onClick={toggle}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
            isDark ? 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200' : 'text-gray-600 hover:bg-gray-100'
          } ${collapsed ? 'justify-center' : ''}`}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
          {!collapsed && <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>
        <button
          onClick={() => setCollapsed(c => !c)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
            isDark ? 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200' : 'text-gray-600 hover:bg-gray-100'
          } ${collapsed ? 'justify-center' : ''}`}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
