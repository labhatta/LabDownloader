import { HarCandidate, Job, MediaInfo, Settings, StreamInfo, SystemInfo } from './types';

export interface IDownloadAdapter {
  platform: 'desktop' | 'web';
  getSystemInfo(): Promise<SystemInfo>;
  analyzeUrl(url: string): Promise<{ type: 'media' | 'stream' | 'document'; info: MediaInfo | StreamInfo }>;
  listJobs(status?: string): Promise<Job[]>;
  getJob(jobId: string): Promise<Job>;
  createJob(params: {
    url: string;
    title?: string;
    thumbnail?: string | null;
    source?: string;
    format_id?: string;
    ext?: string;
  }): Promise<Job>;
  cancelJob(jobId: string): Promise<{ status: string; job_id: string }>;
  retryJob(jobId: string): Promise<Job>;
  deleteJob(jobId: string): Promise<void>;
  clearHistory(keepActive?: boolean): Promise<{ cleared_count: number }>;
  getSettings(): Promise<Settings>;
  updateSettings(settings: Partial<Settings>): Promise<Settings>;
  probeUrl(url: string): Promise<any>;
  uploadHar(file: File): Promise<{ filename: string; candidates_count: number; candidates: HarCandidate[] }>;
  subscribeToEvents(onEvent: (event: string, data: any) => void): () => void;

  // Desktop specific native actions
  openDirectoryDialog(): Promise<string | null>;
  openPath(path: string): Promise<boolean>;
  showItemInFolder(path: string): Promise<boolean>;
}
