export type JobStatus =
  | 'queued'
  | 'analyzing'
  | 'downloading'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'canceled';

export interface Job {
  id: string;
  url: string;
  title: string;
  thumbnail?: string | null;
  source?: string | null;
  format_id?: string | null;
  ext?: string | null;
  status: JobStatus;
  progress: number;
  speed?: string | null;
  downloaded_bytes: number;
  total_bytes: number;
  eta?: string | null;
  output_path?: string | null;
  file_size: number;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MediaFormat {
  format_id: string;
  ext: string;
  resolution: string;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  vcodec?: string | null;
  acodec?: string | null;
  filesize?: number | null;
  filesize_formatted: string;
  is_video: boolean;
  is_audio: boolean;
  format_note?: string;
}

export interface MediaPreset {
  id: string;
  label: string;
  ext: string;
  is_preset: boolean;
  audio_only?: boolean;
}

export interface MediaInfo {
  url: string;
  title: string;
  thumbnail?: string | null;
  duration?: number | null;
  duration_formatted?: string | null;
  uploader?: string | null;
  source: string;
  description?: string;
  formats: MediaFormat[];
  presets: MediaPreset[];
}

export interface StreamVariant {
  url: string;
  resolution: string;
  bandwidth?: number | null;
  bandwidth_formatted?: string | null;
  codecs?: string | null;
  type: string;
}

export interface StreamInfo {
  url: string;
  is_m3u8: boolean;
  is_dash: boolean;
  variants: StreamVariant[];
  is_master: boolean;
  raw_preview: string;
}

export interface HarCandidate {
  id: string;
  url: string;
  original_url: string;
  method: string;
  status: number;
  mime_type: string;
  type: string;
  size?: number | null;
  size_formatted: string;
  suggested_filename: string;
  is_stream: boolean;
  can_download: boolean;
}

export interface Settings {
  download_dir: string;
  max_concurrent: string;
  preferred_format: string;
  preferred_resolution: string;
  theme: string;
  minimize_to_tray: string;
  notify_on_complete: string;
}

export interface SystemInfo {
  ytdlp_version: string;
  ffmpeg_path: string;
  ffmpeg_available: boolean;
  python_version: string;
  default_download_dir: string;
  disk_free_bytes: number;
  disk_free_gb: number;
}

export interface BackendConfig {
  port: number;
  token: string;
  platform: 'desktop' | 'web';
  apiBaseUrl?: string;
}

export interface DesktopAPI {
  getBackendConfig: () => Promise<BackendConfig>;
  openDirectoryDialog: () => Promise<string | null>;
  openPath: (path: string) => Promise<boolean>;
  showItemInFolder: (path: string) => Promise<boolean>;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  isMaximized: () => Promise<boolean>;
}

declare global {
  interface Window {
    labDesktopAPI?: DesktopAPI;
  }
}
