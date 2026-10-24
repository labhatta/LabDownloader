import { IDownloadAdapter } from './adapter';
import {
  HarCandidate,
  Job,
  MediaInfo,
  Settings,
  StreamInfo,
  SystemInfo,
} from './types';

export class WebDownloadAdapter implements IDownloadAdapter {
  public readonly platform = 'web' as const;
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || (typeof window !== 'undefined' ? (window as any).VITE_API_BASE_URL || '' : '');
  }

  private async fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      let errorMsg = `HTTP ${res.status}: ${res.statusText}`;
      try {
        const errorData = await res.json();
        if (errorData.detail) errorMsg = errorData.detail;
      } catch (_) {}
      throw new Error(errorMsg);
    }
    return res.json() as Promise<T>;
  }

  async getSystemInfo(): Promise<SystemInfo> {
    return this.fetchApi<SystemInfo>('/api/system/info');
  }

  async analyzeUrl(url: string): Promise<{ type: 'media' | 'stream' | 'document'; info: MediaInfo | StreamInfo }> {
    return this.fetchApi('/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  }

  async listJobs(status?: string): Promise<Job[]> {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.fetchApi<Job[]>(`/api/jobs${query}`);
  }

  async getJob(jobId: string): Promise<Job> {
    return this.fetchApi<Job>(`/api/jobs/${encodeURIComponent(jobId)}`);
  }

  async createJob(params: {
    url: string;
    title?: string;
    thumbnail?: string | null;
    source?: string;
    format_id?: string;
    ext?: string;
  }): Promise<Job> {
    return this.fetchApi<Job>('/api/jobs', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async createBatchJobs(items: Array<{
    url: string;
    title?: string;
    thumbnail?: string | null;
    source?: string;
    format_id?: string;
    ext?: string;
  }>): Promise<{ jobs: Job[]; errors: Array<{ url: string; error: string }>; total_queued: number }> {
    return this.fetchApi('/api/jobs/batch', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  }

  async cancelJob(jobId: string): Promise<{ status: string; job_id: string }> {
    return this.fetchApi(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: 'POST',
    });
  }

  async retryJob(jobId: string): Promise<Job> {
    return this.fetchApi(`/api/jobs/${encodeURIComponent(jobId)}/retry`, {
      method: 'POST',
    });
  }

  async deleteJob(jobId: string): Promise<void> {
    await this.fetchApi(`/api/jobs/${encodeURIComponent(jobId)}`, {
      method: 'DELETE',
    });
  }

  async clearHistory(keepActive: boolean = true): Promise<{ cleared_count: number }> {
    return this.fetchApi(`/api/jobs?keep_active=${keepActive}`, {
      method: 'DELETE',
    });
  }

  async getSettings(): Promise<Settings> {
    return this.fetchApi<Settings>('/api/settings');
  }

  async updateSettings(settings: Partial<Settings>): Promise<Settings> {
    return this.fetchApi<Settings>('/api/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  }

  async probeUrl(url: string): Promise<any> {
    return this.fetchApi('/api/inspector/probe', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  }

  async uploadHar(file: File): Promise<{ filename: string; candidates_count: number; candidates: HarCandidate[] }> {
    const formData = new FormData();
    formData.append('file', file);

    const url = `${this.baseUrl}/api/inspector/har`;
    const res = await fetch(url, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to upload HAR: ${err}`);
    }
    return res.json();
  }

  subscribeToEvents(onEvent: (event: string, data: any) => void): () => void {
    const sseUrl = `${this.baseUrl}/api/events`;
    const eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        onEvent('message', parsed);
      } catch (_) {}
    };

    const eventTypes = ['job_queued', 'job_progress', 'job_completed', 'job_failed', 'job_canceled'];
    for (const t of eventTypes) {
      eventSource.addEventListener(t, (e: any) => {
        try {
          const parsed = JSON.parse(e.data);
          onEvent(t, parsed);
        } catch (_) {}
      });
    }

    return () => {
      eventSource.close();
    };
  }

  // Web Browser fallbacks (Sandbox safe)
  async openDirectoryDialog(): Promise<string | null> {
    console.warn('Direct folder selection is only supported in Desktop mode.');
    return null;
  }

  async openPath(path: string): Promise<boolean> {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      window.open(path, '_blank');
      return true;
    }
    console.warn('Local file execution blocked in web browser sandbox.');
    return false;
  }

  async showItemInFolder(path: string): Promise<boolean> {
    console.warn('Operating system folder browsing is only available in Desktop mode.');
    return false;
  }
}
