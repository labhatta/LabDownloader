import React, { useState, useEffect, useCallback } from 'react';
import { TitleBar } from './components/TitleBar';
import { Navbar, NavTab } from './components/Navbar';
import { DownloaderPage } from './pages/DownloaderPage';
import { NetworkInspectorPage } from './pages/NetworkInspectorPage';
import { DownloadsPage } from './pages/DownloadsPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { downloadService, Job, SystemInfo } from '@api/index';
import packageInfo from '../../../package.json';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('downloader');
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('lab_dark_mode') === 'true';
  });
  const [backendHealthy, setBackendHealthy] = useState<boolean>(false);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);

  // Toggle dark mode class on <html>
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('lab_dark_mode', String(darkMode));
  }, [darkMode]);

  // Load jobs and system info
  const loadJobs = useCallback(async () => {
    try {
      const list = await downloadService.listJobs();
      setJobs(list);
    } catch (_) {}
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      const info = await downloadService.getSystemInfo();
      setSystemInfo(info);
      setBackendHealthy(true);
    } catch (_) {
      setBackendHealthy(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    loadJobs();

    const interval = setInterval(() => {
      checkHealth();
      loadJobs();
    }, 2500);
    return () => clearInterval(interval);
  }, [checkHealth, loadJobs]);

  // Subscribe to real-time Server-Sent Events (SSE)
  useEffect(() => {
    const unsubscribe = downloadService.subscribeToEvents((event, data) => {
      if (event === 'job_progress') {
        setJobs((prev) =>
          prev.map((j) => (j.id === data.job_id ? { ...j, ...data } : j))
        );
      } else if (event === 'job_completed') {
        setJobs((prev) =>
          prev.map((j) => (j.id === data.job_id ? { ...j, ...data, status: 'completed' } : j))
        );
        // Browser / Electron Desktop Notification
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('LabDownloader', {
            body: `Download complete: ${data.job_id}`,
          });
        }
      } else if (event === 'job_failed') {
        setJobs((prev) =>
          prev.map((j) => (j.id === data.job_id ? { ...j, status: 'failed', error_message: data.error } : j))
        );
      } else if (event === 'job_canceled') {
        setJobs((prev) =>
          prev.map((j) => (j.id === data.job_id ? { ...j, status: 'canceled' } : j))
        );
      } else if (event === 'job_queued') {
        setJobs((prev) => [data, ...prev.filter((j) => j.id !== data.id)]);
      }
    });

    return () => unsubscribe();
  }, []);

  const activeCount = jobs.filter((j) =>
    ['queued', 'analyzing', 'downloading', 'processing'].includes(j.status)
  ).length;

  return (
    <div className="min-h-screen flex flex-col bg-[#FFF6E8] dark:bg-[#181512] text-slate-800 dark:text-slate-100 transition-colors duration-200">
      <TitleBar backendHealthy={backendHealthy} platform={downloadService.platform} />
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeDownloadsCount={activeCount}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
      />

      <main className="flex-1 w-full pb-8">
        {activeTab === 'downloader' && (
          <DownloaderPage
            onJobStarted={() => {
              loadJobs();
              setActiveTab('downloads');
            }}
            defaultDownloadDir={systemInfo?.default_download_dir || 'Downloads/LabDownloader'}
          />
        )}
        {activeTab === 'inspector' && (
          <NetworkInspectorPage
            onJobStarted={() => {
              loadJobs();
              setActiveTab('downloads');
            }}
          />
        )}
        {activeTab === 'downloads' && (
          <DownloadsPage jobs={jobs} onRefresh={loadJobs} />
        )}
        {activeTab === 'history' && (
          <HistoryPage jobs={jobs} onRefresh={loadJobs} />
        )}
        {activeTab === 'settings' && (
          <SettingsPage
            systemInfo={systemInfo}
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            onSettingsUpdated={() => {
              checkHealth();
              loadJobs();
            }}
          />
        )}
      </main>

      <footer className="w-full py-3 px-6 border-t border-[#EEDDC8]/50 dark:border-[#3A332B]/50 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-700 dark:text-slate-300">LabDownloader v{packageInfo.version}</span>
          <span>•</span>
          <span>Universal Video, Audio & Stream Downloader</span>
        </div>
        <div className="flex items-center gap-3">
          <span>Engine: yt-dlp + FFmpeg + HTTPX</span>
          <span>•</span>
          <span className="font-mono">127.0.0.1 (Loopback)</span>
        </div>
      </footer>
    </div>
  );
};
export default App;
