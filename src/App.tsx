import { BrowserRouter, Routes, Route, useOutletContext } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Namespaces from './pages/Namespaces';
import Pods from './pages/Pods';
import Deployments from './pages/Deployments';
import Nodes from './pages/Nodes';
import Actions from './pages/Actions';
import Logs from './pages/Logs';
import Alerts from './pages/Alerts';
import Incidents from './pages/Incidents';
import AIAssistant from './pages/AIAssistant';

// Hook for child pages that need to open the AI chat panel (used by Incidents)
export type LayoutContext = { openChat: (initialMessage?: string) => void };
export function useLayoutContext() {
  return useOutletContext<LayoutContext>();
}

// Wrapper so Incidents page can receive openChat via Outlet context
function IncidentsWrapper() {
  const { openChat } = useLayoutContext();
  return <Incidents onOpenChat={openChat} />;
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/ai-assistant" element={<AIAssistant />} />
            <Route path="/namespaces" element={<Namespaces />} />
            <Route path="/pods" element={<Pods />} />
            <Route path="/deployments" element={<Deployments />} />
            <Route path="/nodes" element={<Nodes />} />
            <Route path="/actions" element={<Actions />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/incidents" element={<IncidentsWrapper />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
