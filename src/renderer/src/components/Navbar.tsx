import React from 'react';
import {
  DownloadCloud,
  Radio,
  ArrowDownToLine,
  History,
  Settings as SettingsIcon,
  Sun,
  Moon,
} from 'lucide-react';

export type NavTab = 'downloader' | 'inspector' | 'downloads' | 'history' | 'settings';

interface NavbarProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  activeDownloadsCount: number;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  activeDownloadsCount,
  darkMode,
  setDarkMode,
}) => {
  const tabs = [
    { id: 'downloader' as NavTab, label: 'Downloader', icon: DownloadCloud },
    { id: 'inspector' as NavTab, label: 'Network Inspector', icon: Radio },
    {
      id: 'downloads' as NavTab,
      label: 'Downloads',
      icon: ArrowDownToLine,
      badge: activeDownloadsCount > 0 ? activeDownloadsCount : null,
    },
    { id: 'history' as NavTab, label: 'History', icon: History },
    { id: 'settings' as NavTab, label: 'Settings', icon: SettingsIcon },
  ];

  return (
    <nav className="w-full px-4 pt-3 pb-2 flex items-center justify-between">
      <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-white/80 dark:bg-[#24201B]/90 border border-[#EEDDC8]/80 dark:border-[#3A332B] shadow-warm-sm backdrop-blur-md">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 ${
                isActive
                  ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-white shadow-md shadow-amber-500/25'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-amber-500/80'}`} />
              <span>{tab.label}</span>
              {tab.badge !== null && (
                <span
                  className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    isActive
                      ? 'bg-white text-amber-600'
                      : 'bg-amber-500 text-white animate-pulse'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-2.5 rounded-xl bg-white/80 dark:bg-[#24201B]/90 border border-[#EEDDC8]/80 dark:border-[#3A332B] shadow-warm-sm text-slate-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-[#2d2822] transition-colors"
          title={darkMode ? 'Switch to Warm Cream' : 'Switch to Dark Mode'}
        >
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </nav>
  );
};
