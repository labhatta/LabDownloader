import React, { useState } from 'react';
import {
  History as HistoryIcon,
  Search,
  Trash2,
  FolderOpen,
  FileCheck,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Filter,
} from 'lucide-react';
import { downloadService, Job } from '@api/index';

interface HistoryPageProps {
  jobs: Job[];
  onRefresh: () => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({ jobs, onRefresh }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'failed' | 'canceled'>('all');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const filteredJobs = jobs.filter((j) => {
    const matchesSearch =
      j.title.toLowerCase().includes(search.toLowerCase()) ||
      j.url.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || j.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleClearHistory = async () => {
    try {
      await downloadService.clearHistory(false);
      setShowClearConfirm(false);
      onRefresh();
    } catch (err: any) {
      alert(`Error clearing history: ${err.message}`);
    }
  };

  const handleDeleteJob = async (id: string) => {
    try {
      await downloadService.deleteJob(id);
      onRefresh();
    } catch (err: any) {
      alert(`Error deleting record: ${err.message}`);
    }
  };

  const handleOpenFile = async (path?: string | null) => {
    if (!path) return;
    try {
      await downloadService.openPath(path);
    } catch (err: any) {
      alert(`Could not open file: ${err.message}`);
    }
  };

  const handleOpenFolder = async (path?: string | null) => {
    if (!path) return;
    try {
      await downloadService.showItemInFolder(path);
    } catch (err: any) {
      alert(`Could not open folder: ${err.message}`);
    }
  };

  const handleRetry = async (id: string) => {
    try {
      await downloadService.retryJob(id);
      onRefresh();
    } catch (err: any) {
      alert(`Could not re-download: ${err.message}`);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white font-['Outfit']">
            Download History
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Persistent log of completed, failed, and canceled downloads
          </p>
        </div>

        {jobs.length > 0 && (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 border border-rose-200 dark:border-rose-900/50 transition-colors shadow-warm-sm"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear History</span>
          </button>
        )}
      </div>

      {/* Confirmation Modal */}
      {showClearConfirm && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 flex items-center justify-between gap-4 text-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2 text-rose-800 dark:text-rose-200">
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>Are you sure you want to clear your entire download history? (Downloaded files on disk are kept).</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowClearConfirm(false)}
              className="px-3 py-1 rounded-lg bg-white dark:bg-[#24201B] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={handleClearHistory}
              className="px-3 py-1 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 shadow-sm"
            >
              Clear All
            </button>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or URL..."
            className="w-full pl-9 pr-4 py-2.5 rounded-2xl bg-white dark:bg-[#24201B] border border-[#EEDDC8] dark:border-[#3A332B] text-slate-800 dark:text-slate-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/50 shadow-warm-sm"
          />
        </div>

        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-white dark:bg-[#24201B] border border-[#EEDDC8] dark:border-[#3A332B] shadow-warm-sm text-xs">
          {(['all', 'completed', 'failed', 'canceled'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-xl capitalize font-semibold transition-colors ${
                statusFilter === status
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Table / Cards */}
      {filteredJobs.length > 0 ? (
        <div className="bg-white dark:bg-[#24201B] rounded-3xl border border-[#EEDDC8] dark:border-[#3A332B] shadow-warm divide-y divide-[#EEDDC8]/50 dark:divide-[#3A332B]/50 overflow-hidden">
          {filteredJobs.map((job) => (
            <div key={job.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    job.status === 'completed'
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400'
                      : job.status === 'failed'
                      ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400'
                      : 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {job.status === 'completed' ? (
                    <FileCheck className="w-5 h-5" />
                  ) : job.status === 'failed' ? (
                    <AlertTriangle className="w-5 h-5" />
                  ) : (
                    <HistoryIcon className="w-5 h-5" />
                  )}
                </div>

                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 dark:text-white truncate text-sm">
                    {job.title}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    <span className="capitalize font-semibold text-slate-700 dark:text-slate-300">
                      {job.source || 'Generic'}
                    </span>
                    <span>•</span>
                    <span className="font-mono">{job.ext || 'mp4'}</span>
                    {job.file_size > 0 && (
                      <>
                        <span>•</span>
                        <span>{(job.file_size / (1024 * 1024)).toFixed(1)} MB</span>
                      </>
                    )}
                    <span>•</span>
                    <span>{new Date(job.created_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
                {job.status === 'completed' && job.output_path && (
                  <>
                    <button
                      onClick={() => handleOpenFile(job.output_path)}
                      className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold transition-colors shadow-sm"
                    >
                      Open
                    </button>
                    <button
                      onClick={() => handleOpenFolder(job.output_path)}
                      className="p-2 rounded-xl bg-slate-100 dark:bg-white/10 hover:bg-slate-200 text-slate-600 dark:text-slate-300 transition-colors"
                      title="Show in Folder"
                    >
                      <FolderOpen className="w-4 h-4" />
                    </button>
                  </>
                )}
                {job.status !== 'completed' && (
                  <button
                    onClick={() => handleRetry(job.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold transition-colors shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Re-download</span>
                  </button>
                )}
                <button
                  onClick={() => handleDeleteJob(job.id)}
                  className="p-2 rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                  title="Delete Record"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-[#24201B] p-12 rounded-3xl border border-[#EEDDC8] dark:border-[#3A332B] shadow-warm text-center space-y-2">
          <HistoryIcon className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">
            No History Records Found
          </h2>
          <p className="text-xs text-slate-400">
            {search ? 'Try adjusting your search query.' : 'Downloaded items will appear here.'}
          </p>
        </div>
      )}
    </div>
  );
};
