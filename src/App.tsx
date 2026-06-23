import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Namespaces from './pages/Namespaces';
import Pods from './pages/Pods';
import Deployments from './pages/Deployments';
import Nodes from './pages/Nodes';
import Logs from './pages/Logs';
import Alerts from './pages/Alerts';

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/namespaces" element={<Namespaces />} />
            <Route path="/pods" element={<Pods />} />
            <Route path="/deployments" element={<Deployments />} />
            <Route path="/nodes" element={<Nodes />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="/alerts" element={<Alerts />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
