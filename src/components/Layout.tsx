import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import AIChat from './AIChat';
import { useTheme } from '../context/ThemeContext';
import { Sparkles } from 'lucide-react';

export default function Layout() {
  const { isDark } = useTheme();
  const [isChatOpen, setIsChatOpen] = useState(false);

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#060a14] text-white' : 'bg-gray-50 text-gray-900'}`}>
      <Sidebar />
      <div className="ml-[240px] transition-all duration-300">
        <Header />
        <main className="p-6">
          <Outlet />
        </main>
      </div>

      {/* AI Assistant Floating Button */}
      <button
        onClick={() => setIsChatOpen(true)}
        className="fixed bottom-8 right-8 p-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-full shadow-2xl transition-all hover:scale-110 z-40 group"
        title="Open AI Assistant"
      >
        <Sparkles className="w-6 h-6" />
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
      </button>

      {/* AI Chat Modal */}
      <AIChat isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </div>
  );
}
