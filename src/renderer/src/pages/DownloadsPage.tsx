import React, { useState } from 'react';
import {
  ArrowDownToLine,
  Play,
  Square,
  RefreshCw,
  FolderOpen,
  FileCheck,
  Trash2,
  AlertCircle,
  Clock,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { downloadService, Job } from '@api/index';

interface DownloadsPageProps {
  jobs: Job[];
  onRefresh: () => void;
}

export const DownloadsPage: React.FC<DownloadsPageProps> = ({ jobs, onRefresh }) => {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const activeJobs = jobs.filter((j) =>
    ['queued', 'analyzing', 'downloading', 'processing'].includes(j.status)
  );
  const completedJobs = jobs.filter((j) =>
    ['completed', 'failed', 'canceled'].includes(j.status)
  );

  const handleCancel = async (jobId: string) => {
    try {
      await downloadService.cancelJob(jobId);
      onRefresh();
    } catch (err: any) {
      alert(`Error canceling: ${err.message}`);
    }
  };

  const handleRetry = async (jobId: string) => {
    try {
      await downloadService.retryJob(jobId);
      onRefresh();
    } catch (err: any) {
      alert(`Error retrying: ${err.message}`);
    }
  };

  const handleOpenFile = async (outputPath?: string | null) => {
    if (!outputPath) return;
    try {
      await downloadService.openPath(outputPath);
    } catch (err: any) {
      alert(`Could not open file: ${err.message}`);
    }
  };

  const handleOpenFolder = async (outputPath?: string | null) => {
    if (!outputPath) return;
    try {
      await downloadService.showItemInFolder(outputPath);
    } catch (err: any) {
      alert(`Could not open folder: ${err.message}`);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    try {
      await downloadService.deleteJob(jobId);
      setDeleteConfirmId(null);
      onRefresh();
    } catch (err: any) {
      alert(`Error deleting job: ${err.message}`);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white font-['Outfit']">
            Downloads Queue
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {activeJobs.length} active download{activeJobs.length !== 1 ? 's' : ''} in progress
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-[#24201B] border border-[#EEDDC8] dark:border-[#3A332B] text-slate-600 dark:text-slate-300 hover:bg-slate-50 text-xs font-semibold shadow-warm-sm transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Active Downloads List */}
      {activeJobs.length > 0 ? (
        <div className="space-y-4">
          {activeJobs.map((job) => (
            <div
              key={job.id}
              className="bg-white dark:bg-[#24201B] p-5 rounded-3xl border border-[#EEDDC8] dark:border-[#3A332B] shadow-warm space-y-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {job.thumbnail ? (
                    <img
                      src={job.thumbnail}
                      alt={job.title}
                      className="w-16 h-12 rounded-xl object-cover border border-[#EEDDC8]/50 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0 border border-amber-200/50">
                      <ArrowDownToLine className="w-6 h-6" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                      {job.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className="px-1.5 py-0.2 rounded font-semibold text-[10px] bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                        {job.source || 'Generic'}
                      </span>
                      <span>Format: {job.ext || 'mp4'}</span>
                      {job.speed && <span className="text-amber-600 dark:text-amber-400 font-bold">{job.speed}</span>}
                      {job.eta && <span>ETA: {job.eta}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleCancel(job.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-300 text-xs font-semibold hover:bg-rose-100 transition-colors"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Cancel</span>
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1">
                <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-black/30 overflow-hidden p-0.5 border border-[#EEDDC8]/50 dark:border-[#3A332B]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-300 shadow-sm"
                    style={{ width: `${Math.max(job.progress, 2)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <span className="capitalize">{job.status}...</span>
                  <span>{job.progress.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-[#24201B] p-10 rounded-3xl border border-[#EEDDC8] dark:border-[#3A332B] shadow-warm text-center space-y-3">
          <div className="w-16 h-16 rounded-3xl bg-amber-50 dark:bg-amber-950/40 text-amber-500 flex items-center justify-center mx-auto border border-amber-200/50">
            <ArrowDownToLine className="w-8 h-8" />
          </div>
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 font-['Outfit']">
            No Active Downloads
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            Your download queue is currently empty. Analyze a video, audio, or document link in the Downloader tab to start.
          </p>
        </div>
      )}

      {/* Completed In This Session */}
      {completedJobs.length > 0 && (
        <div className="space-y-3 pt-4">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider font-['Outfit']">
            Recent Activity ({completedJobs.length})
          </h2>
          <div className="bg-white dark:bg-[#24201B] rounded-3xl border border-[#EEDDC8] dark:border-[#3A332B] shadow-warm divide-y divide-[#EEDDC8]/50 dark:divide-[#3A332B]/50 overflow-hidden">
            {completedJobs.slice(0, 5).map((job) => (
              <div key={job.id} className="p-4 flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      job.status === 'completed'
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400'
                        : 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {job.status === 'completed' ? (
                      <FileCheck className="w-4 h-4" />
                    ) : (
                      <AlertCircle className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 dark:text-slate-200 truncate">
                      {job.title}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                      <span className="capitalize font-semibold">{job.status}</span>
                      {job.file_size > 0 && (
                        <span>• {(job.file_size / (1024 * 1024)).toFixed(1)} MB</span>
                      )}
                      {job.error_message && (
                        <span className="text-rose-600 truncate max-w-xs">• {job.error_message}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {job.status === 'completed' && job.output_path && (
                    <>
                      <button
                        onClick={() => handleOpenFile(job.output_path)}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold transition-colors shadow-sm"
                      >
                        Open File
                      </button>
                      <button
                        onClick={() => handleOpenFolder(job.output_path)}
                        className="p-1.5 rounded-lg bg-slate-100 dark:bg-white/10 hover:bg-slate-200 text-slate-600 dark:text-slate-300 transition-colors"
                        title="Show in Folder"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  {job.status !== 'completed' && (
                    <button
                      onClick={() => handleRetry(job.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold flex items-center gap-1 transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Retry</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
