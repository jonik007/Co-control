import React, { useCallback, useEffect, useState } from 'react';
import './styles/App.css';
import Sidebar from './components/Sidebar';
import ContainersPage from './pages/ContainersPage';
import ImagesPage from './pages/ImagesPage';
import { ToastProvider } from './context/ToastContext';
import { api } from './api/client';

const SYSTEM_POLL_MS = 10000;

function AppShell() {
  const [activePage, setActivePage] = useState('containers');
  const [systemInfo, setSystemInfo] = useState(null);
  const [containerCounts, setContainerCounts] = useState(null);
  const [runImageRequest, setRunImageRequest] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const fetchInfo = async () => {
      try {
        const data = await api.systemInfo();
        if (!cancelled) setSystemInfo(data);
      } catch {
        // Backend may still be starting up; the next poll will retry.
      }
    };
    fetchInfo();
    const interval = setInterval(fetchInfo, SYSTEM_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleRunFromImage = useCallback((imageTag) => {
    setActivePage('containers');
    setRunImageRequest({ image: imageTag, ts: Date.now() });
  }, []);

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        systemInfo={systemInfo}
        containerCounts={containerCounts}
      />
      <main className="content">
        {activePage === 'containers' ? (
          <ContainersPage onCountsChange={setContainerCounts} runImageRequest={runImageRequest} />
        ) : (
          <ImagesPage onRunFromImage={handleRunFromImage} />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
