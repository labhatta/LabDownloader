import React, { useState, useEffect } from 'react';
import { Minus, Square, X, DownloadCloud, Activity } from 'lucide-react';

interface TitleBarProps {
  backendHealthy: boolean;
  platform: 'desktop' | 'web';
}

export const TitleBar: React.FC<TitleBarProps> = ({ backendHealthy, platform }) => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (platform === 'desktop' && window.labDesktopAPI?.isMaximized) {
      window.labDesktopAPI.isMaximized().then(setIsMaximized);
    }
  }, [platform]);

  const handleMinimize = () => {
    window.labDesktopAPI?.minimizeWindow();
  };

  const handleMaximize = async () => {
    window.labDesktopAPI?.maximizeWindow();
    if (window.labDesktopAPI?.isMaximized) {
      const max = await window.labDesktopAPI.isMaximized();
      setIsMaximized(max);
    }
  };

  const handleClose = () => {
    window.labDesktopAPI?.closeWindow();
  };

  return (
    <header className="h-10 w-full flex items-center justify-between px-3 select-none border-b border-[#EEDDC8]/60 dark:border-[#3A332B] bg-[#FFF6E8]/90 dark:bg-[#181512]/90 backdrop-blur-md titlebar-drag z-50">
      <div className="flex items-center gap-2 titlebar-nodrag">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-amber-500 to-amber-400 flex items-center justify-center shadow-sm">
          <DownloadCloud className="w-3.5 h-3.5 text-white stroke-[2.5]" />
        </div>
        <span className="font-['Outfit'] font-bold text-sm tracking-tight text-slate-800 dark:text-slate-100">
          Lab<span className="text-amber-600 dark:text-amber-400">Downloader</span>
        </span>
        <div className="ml-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/70 dark:bg-white/10 border border-[#EEDDC8] dark:border-white/10 text-slate-600 dark:text-slate-300">
          <span className={`w-1.5 h-1.5 rounded-full ${backendHealthy ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
          {backendHealthy ? 'Engine Active' : 'Connecting Engine...'}
        </div>
        {platform === 'web' && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            Web Mode
          </span>
        )}
      </div>

      {platform === 'desktop' && (
        <div className="flex items-center titlebar-nodrag -mr-1">
          <button
            onClick={handleMinimize}
            className="w-9 h-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            title="Minimize"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleMaximize}
            className="w-9 h-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            title={isMaximized ? "Restore" : "Maximize"}
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            onClick={handleClose}
            className="w-9 h-8 flex items-center justify-center rounded-lg hover:bg-rose-500 hover:text-white text-slate-500 dark:text-slate-400 transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </header>
  );
};
