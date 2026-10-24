import { IDownloadAdapter } from './adapter';
import {
  BackendConfig,
  HarCandidate,
  Job,
  MediaInfo,
  Settings,
  StreamInfo,
  SystemInfo,
} from './types';

export class DesktopDownloadAdapter implements IDownloadAdapter {
  public readonly platform = 'desktop' as const;
  private config: BackendConfig | null = null;
  private baseUrl = 'http://127.0.0.1:52174';
  private authToken = 'devtoken1234567890abcdef';
  private initialized = false;

  private async ensureInitialized(): Promise<void> {
    if (this.initialized && this.config) return;

    if (typeof window !== 'undefined' && window.labDesktopAPI) {
      try {
        this.config = await window.labDesktopAPI.getBackendConfig();
        if (this.config && this.config.port) {
          this.baseUrl = `http://127.0.0.1:${this.config.port}`;
          this.authToken = this.config.token;
          this.initialized = true;
        }
      } catch (err) {
        console.warn('Waiting for Electron backend configuration...', err);
      }
    } else {
      this.initialized = true;
    }
  }

  private async fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    await this.ensureInitialized();
    const url = `${this.baseUrl}${endpoint}`;
    const headers = new Headers(options.headers || {});
    headers.set('X-Lab-Token', this.authToken);
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
    await this.ensureInitialized();
    const formData = new FormData();
    formData.append('file', file);

    const url = `${this.baseUrl}/api/inspector/har`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Lab-Token': this.authToken,
      },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to upload HAR: ${err}`);
    }
    return res.json();
  }

  subscribeToEvents(onEvent: (event: string, data: any) => void): () => void {
    let eventSource: EventSource | null = null;
    let isClosed = false;

    const connect = async () => {
      await this.ensureInitialized();
      if (isClosed) return;

      const sseUrl = `${this.baseUrl}/api/events?token=${encodeURIComponent(this.authToken)}`;
      eventSource = new EventSource(sseUrl);

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

      eventSource.onerror = () => {
        if (!isClosed) {
          eventSource?.close();
          // Retry connection after 3 seconds
          setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      isClosed = true;
      eventSource?.close();
    };
  }

  // Desktop Native Bridge Actions
  async openDirectoryDialog(): Promise<string | null> {
    if (window.labDesktopAPI?.openDirectoryDialog) {
      return window.labDesktopAPI.openDirectoryDialog();
    }
    return null;
  }

  async openPath(path: string): Promise<boolean> {
    if (window.labDesktopAPI?.openPath) {
      return window.labDesktopAPI.openPath(path);
    }
    return false;
  }

  async showItemInFolder(path: string): Promise<boolean> {
    if (window.labDesktopAPI?.showItemInFolder) {
      return window.labDesktopAPI.showItemInFolder(path);
    }
    return false;
  }
}
