import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import AIChat from './AIChat';
import { useTheme } from '../context/ThemeContext';

export default function Layout() {
  const { isDark } = useTheme();
  const [isChatOpen, setIsChatOpen] = useState(false);

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#060a14] text-white' : 'bg-gray-50 text-gray-900'}`}>
      <Sidebar onOpenChat={() => setIsChatOpen(true)} />
      <div className="ml-[240px] transition-all duration-300">
        <Header />
        <main className="p-6">
          <Outlet />
        </main>
      </div>

      {/* AI Chat Modal */}
      <AIChat isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </div>
  );
}
