import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  FolderOpen,
  Cpu,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  FileText,
  Save,
  Moon,
  Sun,
  Bell,
  Layers,
  Sparkles,
} from 'lucide-react';
import { downloadService, Settings, SystemInfo } from '@api/index';

interface SettingsPageProps {
  systemInfo: SystemInfo | null;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  onSettingsUpdated: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  systemInfo,
  darkMode,
  setDarkMode,
  onSettingsUpdated,
}) => {
  const [settings, setSettings] = useState<Settings>({
    download_dir: '',
    max_concurrent: '3',
    preferred_format: 'best',
    preferred_resolution: '1080p',
    theme: 'cream',
    minimize_to_tray: 'false',
    notify_on_complete: 'true',
  });

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    downloadService.getSettings().then((s) => {
      setSettings(s);
    });
  }, []);

  const handleBrowseFolder = async () => {
    try {
      const selected = await downloadService.openDirectoryDialog();
      if (selected) {
        setSettings((prev) => ({ ...prev, download_dir: selected }));
      }
    } catch (err: any) {
      alert(`Could not select folder: ${err.message}`);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);
    try {
      await downloadService.updateSettings(settings);
      setSavedSuccess(true);
      onSettingsUpdated();
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      alert(`Could not save settings: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white font-['Outfit']">
          Settings & Diagnostics
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Configure download directories, concurrent connections, preferences, and inspect engine health.
        </p>
      </div>

      {savedSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 flex items-center gap-3 text-emerald-700 dark:text-emerald-300 text-sm">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <p className="font-semibold">Settings updated successfully!</p>
        </div>
      )}

      {/* System Status & Dependencies Card */}
      <div className="bg-white dark:bg-[#24201B] p-6 rounded-3xl border border-[#EEDDC8] dark:border-[#3A332B] shadow-warm space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white font-['Outfit']">
          <Cpu className="w-4 h-4 text-amber-500" />
          <span>Core Engines & Dependency Status</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {/* yt-dlp */}
          <div className="p-3.5 rounded-2xl bg-[#FFF6E8]/60 dark:bg-[#1c1814] border border-[#EEDDC8]/80 dark:border-[#3A332B] space-y-1">
            <span className="text-slate-500 text-[10px] uppercase font-bold">yt-dlp Engine</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="font-bold text-slate-800 dark:text-slate-200">
                v{systemInfo?.ytdlp_version || 'Available'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">Metadata & Video Extractor</p>
          </div>

          {/* FFmpeg */}
          <div className="p-3.5 rounded-2xl bg-[#FFF6E8]/60 dark:bg-[#1c1814] border border-[#EEDDC8]/80 dark:border-[#3A332B] space-y-1">
            <span className="text-slate-500 text-[10px] uppercase font-bold">FFmpeg Muxer</span>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  systemInfo?.ffmpeg_available ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
              />
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {systemInfo?.ffmpeg_available ? 'Ready (Installed)' : 'Missing'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 truncate" title={systemInfo?.ffmpeg_path}>
              {systemInfo?.ffmpeg_path || 'Not detected'}
            </p>
          </div>

          {/* Python Backend */}
          <div className="p-3.5 rounded-2xl bg-[#FFF6E8]/60 dark:bg-[#1c1814] border border-[#EEDDC8]/80 dark:border-[#3A332B] space-y-1">
            <span className="text-slate-500 text-[10px] uppercase font-bold">FastAPI Backend</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="font-bold text-slate-800 dark:text-slate-200">
                Python {systemInfo?.python_version || '3.14'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">Loopback HTTP/SSE (127.0.0.1)</p>
          </div>

          {/* Disk Space */}
          <div className="p-3.5 rounded-2xl bg-[#FFF6E8]/60 dark:bg-[#1c1814] border border-[#EEDDC8]/80 dark:border-[#3A332B] space-y-1">
            <span className="text-slate-500 text-[10px] uppercase font-bold">Available Disk</span>
            <div className="flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {systemInfo?.disk_free_gb || '0'} GB Free
              </span>
            </div>
            <p className="text-[10px] text-slate-400">Download partition</p>
          </div>
        </div>
      </div>

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="space-y-6">
        <div className="bg-white dark:bg-[#24201B] p-6 rounded-3xl border border-[#EEDDC8] dark:border-[#3A332B] shadow-warm space-y-5">
          {/* Default download directory */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Default Download Folder
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={settings.download_dir}
                onChange={(e) => setSettings({ ...settings, download_dir: e.target.value })}
                className="flex-1 px-4 py-2.5 rounded-2xl bg-[#FFF6E8]/50 dark:bg-[#181512]/60 border border-[#EEDDC8]/80 dark:border-[#3A332B] text-slate-800 dark:text-slate-100 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
              <button
                type="button"
                onClick={handleBrowseFolder}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200 text-xs font-semibold transition-colors"
              >
                <FolderOpen className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>Browse</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
            {/* Max concurrent downloads */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Maximum Concurrent Downloads
              </label>
              <select
                value={settings.max_concurrent}
                onChange={(e) => setSettings({ ...settings, max_concurrent: e.target.value })}
                className="w-full px-4 py-2.5 rounded-2xl bg-[#FFF6E8]/50 dark:bg-[#181512]/60 border border-[#EEDDC8]/80 dark:border-[#3A332B] text-slate-800 dark:text-slate-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              >
                <option value="1">1 (Sequential downloads)</option>
                <option value="2">2 Concurrent</option>
                <option value="3">3 Concurrent (Recommended)</option>
                <option value="4">4 Concurrent</option>
                <option value="5">5 Concurrent (High bandwidth)</option>
              </select>
            </div>

            {/* Preferred resolution */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Default Quality Preference
              </label>
              <select
                value={settings.preferred_resolution}
                onChange={(e) => setSettings({ ...settings, preferred_resolution: e.target.value })}
                className="w-full px-4 py-2.5 rounded-2xl bg-[#FFF6E8]/50 dark:bg-[#181512]/60 border border-[#EEDDC8]/80 dark:border-[#3A332B] text-slate-800 dark:text-slate-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              >
                <option value="best">Best Available (Auto)</option>
                <option value="2160p">4K (2160p)</option>
                <option value="1080p">1080p Full HD</option>
                <option value="720p">720p HD</option>
                <option value="audio_only">Audio Only (MP3)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
            {/* Preferred video format */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Preferred Container
              </label>
              <select
                value={settings.preferred_format}
                onChange={(e) => setSettings({ ...settings, preferred_format: e.target.value })}
                className="w-full px-4 py-2.5 rounded-2xl bg-[#FFF6E8]/50 dark:bg-[#181512]/60 border border-[#EEDDC8]/80 dark:border-[#3A332B] text-slate-800 dark:text-slate-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              >
                <option value="best">Best Compatible (Auto)</option>
                <option value="mp4">MP4 (Universal)</option>
                <option value="mkv">MKV (Matroska)</option>
                <option value="webm">WebM</option>
                <option value="mp3">MP3 (Audio)</option>
              </select>
            </div>

            {/* Notification toggle */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Completion Notifications
              </label>
              <button
                type="button"
                onClick={() =>
                  setSettings({
                    ...settings,
                    notify_on_complete: settings.notify_on_complete === 'true' ? 'false' : 'true',
                  })
                }
                className="w-full px-4 py-2.5 rounded-2xl bg-[#FFF6E8]/50 dark:bg-[#181512]/60 border border-[#EEDDC8]/80 dark:border-[#3A332B] text-slate-800 dark:text-slate-100 text-xs font-semibold flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-500" />
                  <span>Desktop Notification on Finish</span>
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    settings.notify_on_complete === 'true'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {settings.notify_on_complete === 'true' ? 'Enabled' : 'Disabled'}
                </span>
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-[#EEDDC8]/60 dark:border-[#3A332B] flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowLogs(!showLogs)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-medium"
            >
              <FileText className="w-3.5 h-3.5 text-amber-500" />
              <span>{showLogs ? 'Hide Diagnostic Logs' : 'View Redacted Diagnostics Log'}</span>
            </button>

            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-white font-bold text-xs shadow-md shadow-amber-500/25 transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Preferences'}</span>
            </button>
          </div>
        </div>
      </form>

      {/* Redacted Diagnostics Log Viewer */}
      {showLogs && (
        <div className="bg-white dark:bg-[#24201B] p-6 rounded-3xl border border-[#EEDDC8] dark:border-[#3A332B] shadow-warm space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 font-mono">
              Diagnostic Logs (Secrets & Tokens Redacted)
            </h3>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase">
              Sanitized Output
            </span>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900 text-slate-200 font-mono text-[11px] max-h-64 overflow-y-auto space-y-1">
            <p className="text-emerald-400">[*] LabDownloader Core Initialized</p>
            <p>[*] Loopback Binding: 127.0.0.1 (Strict private IP check enabled)</p>
            <p>[*] yt-dlp version: {systemInfo?.ytdlp_version}</p>
            <p>[*] ffmpeg path: {systemInfo?.ffmpeg_path}</p>
            <p>[*] Auth Token: [REDACTED]</p>
            <p>[*] SSE Broadcaster: 0 active subscribers</p>
            <p className="text-slate-400">
              [DEBUG] Session ID: [REDACTED] | User-Agent: Mozilla/5.0 LabDownloader/1.0
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
