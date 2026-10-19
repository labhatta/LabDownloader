import React, { useState } from 'react';
import {
  Download,
  Link,
  ClipboardPaste,
  XCircle,
  PlayCircle,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  FolderOpen,
  Music,
  Video,
  FileText,
  Clock,
  Layers,
} from 'lucide-react';
import { downloadService, MediaInfo, MediaPreset, StreamInfo } from '@api/index';

interface DownloaderPageProps {
  onJobStarted: () => void;
  defaultDownloadDir: string;
}

export const DownloaderPage: React.FC<DownloaderPageProps> = ({ onJobStarted, defaultDownloadDir }) => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [analyzedType, setAnalyzedType] = useState<'media' | 'stream' | 'document' | null>(null);
  const [mediaData, setMediaData] = useState<MediaInfo | null>(null);
  const [streamData, setStreamData] = useState<StreamInfo | null>(null);

  const [selectedFormatId, setSelectedFormatId] = useState<string>('bestvideo+bestaudio/best');
  const [selectedExt, setSelectedExt] = useState<string>('mp4');

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
        setError(null);
      }
    } catch (_) {
      setError('Could not access clipboard. Please paste manually with Ctrl+V.');
    }
  };

  const handleClear = () => {
    setUrl('');
    setError(null);
    setSuccessMsg(null);
    setAnalyzedType(null);
    setMediaData(null);
    setStreamData(null);
  };

  const handleAnalyze = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url.trim()) {
      setError('Please enter a valid URL.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    setAnalyzedType(null);

    try {
      const res = await downloadService.analyzeUrl(url.trim());
      setAnalyzedType(res.type);
      if (res.type === 'media' || res.type === 'document') {
        const info = res.info as MediaInfo;
        setMediaData(info);
        // Default to best preset
        if (info.presets && info.presets.length > 0) {
          setSelectedFormatId(info.presets[0].id);
          setSelectedExt(info.presets[0].ext);
        } else if (info.formats && info.formats.length > 0) {
          setSelectedFormatId(info.formats[0].format_id);
          setSelectedExt(info.formats[0].ext);
        }
      } else if (res.type === 'stream') {
        setStreamData(res.info as StreamInfo);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to analyze URL. Ensure the URL is accessible and supported.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartDownload = async () => {
    if (!url.trim()) return;
    setDownloading(true);
    setError(null);

    try {
      let title = 'Lab Download';
      let thumbnail: string | null = null;
      let source = 'Generic';

      if ((analyzedType === 'media' || analyzedType === 'document') && mediaData) {
        title = mediaData.title;
        thumbnail = mediaData.thumbnail || null;
        source = mediaData.source;
      } else if (analyzedType === 'stream' && streamData) {
        title = `HLS Stream - ${new URL(streamData.url).hostname}`;
        source = 'HLS';
      }

      await downloadService.createJob({
        url: url.trim(),
        title,
        thumbnail,
        source,
        format_id: selectedFormatId,
        ext: selectedExt,
      });

      setSuccessMsg('Download queued successfully!');
      setTimeout(() => setSuccessMsg(null), 4000);
      onJobStarted();
    } catch (err: any) {
      setError(err.message || 'Failed to start download.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Hero Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100/90 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/40">
          <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span>Universal High-Speed Downloader</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white font-['Outfit']">
          Download media & streams with ease
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
          Paste links from YouTube, Twitter/X, Instagram, TikTok, HLS .m3u8 playlists, or direct files.
        </p>
      </div>

      {/* Main Input Card */}
      <div className="bg-white dark:bg-[#24201B] p-5 rounded-3xl border border-[#EEDDC8] dark:border-[#3A332B] shadow-warm">
        <form onSubmit={handleAnalyze} className="space-y-4">
          <div className="relative flex items-center">
            <div className="absolute left-4 text-amber-500">
              <Link className="w-5 h-5" />
            </div>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste video, audio, HLS .m3u8, or direct file URL..."
              className="w-full pl-12 pr-28 py-4 rounded-2xl bg-[#FFF6E8]/50 dark:bg-[#181512]/60 border border-[#EEDDC8]/80 dark:border-[#3A332B] text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm font-medium transition-all"
            />
            <div className="absolute right-3 flex items-center gap-1.5">
              {url && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  title="Clear"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={handlePaste}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-[#2d2822] hover:bg-amber-50 dark:hover:bg-[#363028] border border-[#EEDDC8] dark:border-[#3A332B] transition-colors shadow-sm"
              >
                <ClipboardPaste className="w-3.5 h-3.5 text-amber-500" />
                <span>Paste</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Supported:</span>
              <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-[#1e1b17] border border-amber-200/50 dark:border-[#383127] text-slate-600 dark:text-slate-300">YouTube</span>
              <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-[#1e1b17] border border-amber-200/50 dark:border-[#383127] text-slate-600 dark:text-slate-300">Scribd</span>
              <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-[#1e1b17] border border-amber-200/50 dark:border-[#383127] text-slate-600 dark:text-slate-300">Academia.edu</span>
              <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-[#1e1b17] border border-amber-200/50 dark:border-[#383127] text-slate-600 dark:text-slate-300">Twitter / X</span>
              <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-[#1e1b17] border border-amber-200/50 dark:border-[#383127] text-slate-600 dark:text-slate-300">Instagram</span>
              <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-[#1e1b17] border border-amber-200/50 dark:border-[#383127] text-slate-600 dark:text-slate-300">HLS .m3u8</span>
              <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-[#1e1b17] border border-amber-200/50 dark:border-[#383127] text-slate-600 dark:text-slate-300">PDF & Documents</span>
            </div>

            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-white font-bold text-sm shadow-md shadow-amber-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <PlayCircle className="w-4 h-4" />
                  <span>Analyze URL</span>
                </>
              )}
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-4 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-start gap-3 text-rose-700 dark:text-rose-300 text-sm">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Analysis Failed</p>
              <p className="text-xs mt-0.5 text-rose-600 dark:text-rose-400">{error}</p>
            </div>
          </div>
        )}

        {successMsg && (
          <div className="mt-4 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 flex items-center gap-3 text-emerald-700 dark:text-emerald-300 text-sm">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <p className="font-semibold">{successMsg}</p>
          </div>
        )}
      </div>

      {/* Media or Document Analysis Result Preview Card */}
      {(analyzedType === 'media' || analyzedType === 'document') && mediaData && (
        <div className="bg-white dark:bg-[#24201B] p-6 rounded-3xl border border-[#EEDDC8] dark:border-[#3A332B] shadow-warm space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex flex-col md:flex-row gap-6 items-start">
            {/* Thumbnail */}
            <div className="relative w-full md:w-72 h-44 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0 border border-[#EEDDC8]/60 dark:border-[#3A332B] shadow-sm">
              {mediaData.thumbnail ? (
                <img
                  src={mediaData.thumbnail}
                  alt={mediaData.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                  {analyzedType === 'document' ? (
                    <FileText className="w-10 h-10 mb-1 text-amber-500" />
                  ) : (
                    <Video className="w-10 h-10 mb-1" />
                  )}
                  <span className="text-xs">{analyzedType === 'document' ? 'Document PDF' : 'No Thumbnail'}</span>
                </div>
              )}
              {mediaData.duration_formatted && (
                <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-lg bg-black/80 backdrop-blur-sm text-white text-[11px] font-semibold flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{mediaData.duration_formatted}</span>
                </div>
              )}
            </div>

            {/* Metadata Info */}
            <div className="flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/50">
                  {mediaData.source}
                </span>
                {mediaData.uploader && (
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    by {mediaData.uploader}
                  </span>
                )}
              </div>

              <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-snug font-['Outfit']">
                {mediaData.title}
              </h2>

              {mediaData.description && (
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                  {mediaData.description}
                </p>
              )}

              {/* Format selection presets */}
              <div className="space-y-2 pt-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Select Download Quality / Format:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {mediaData.presets && mediaData.presets.map((preset) => {
                    const isSelected = selectedFormatId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setSelectedFormatId(preset.id);
                          setSelectedExt(preset.ext);
                        }}
                        className={`p-3 rounded-2xl text-left border transition-all flex items-center justify-between ${
                          isSelected
                            ? 'border-amber-500 bg-amber-50/80 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 ring-2 ring-amber-500/20 shadow-sm'
                            : 'border-[#EEDDC8]/80 dark:border-[#3A332B] hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          {preset.audio_only ? (
                            <Music className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                          ) : (
                            <Video className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                          )}
                          <div>
                            <p className="text-xs font-bold">{preset.label}</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-mono">
                              Format: {preset.ext}
                            </p>
                          </div>
                        </div>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="pt-4 border-t border-[#EEDDC8]/60 dark:border-[#3A332B] flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <FolderOpen className="w-4 h-4 text-amber-500" />
              <span>Saving to:</span>
              <span className="font-mono text-slate-800 dark:text-slate-200 font-medium truncate max-w-xs">
                {defaultDownloadDir}
              </span>
            </div>

            <button
              onClick={handleStartDownload}
              disabled={downloading}
              className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-white font-bold text-sm shadow-lg shadow-amber-500/30 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            >
              {downloading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Starting...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Download Media</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Stream Manifest Result Preview Card */}
      {analyzedType === 'stream' && streamData && (
        <div className="bg-white dark:bg-[#24201B] p-6 rounded-3xl border border-[#EEDDC8] dark:border-[#3A332B] shadow-warm space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/50">
                {streamData.is_m3u8 ? 'HLS Master Playlist' : 'DASH Stream'}
              </span>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-2 font-['Outfit']">
                Stream manifest detected: {streamData.variants.length} variant tracks
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-1 break-all">
                {streamData.url}
              </p>
            </div>
            <Layers className="w-8 h-8 text-amber-500" />
          </div>

          {streamData.variants.length > 0 ? (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                Available Stream Resolutions:
              </label>
              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {streamData.variants.map((v, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-[#1c1814] border border-[#EEDDC8]/60 dark:border-[#3A332B] flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {v.resolution}
                      </span>
                      {v.bandwidth_formatted && (
                        <span className="ml-2 text-slate-500 dark:text-slate-400">
                          ({v.bandwidth_formatted})
                        </span>
                      )}
                    </div>
                    {v.codecs && (
                      <span className="font-mono text-[10px] text-slate-400">
                        {v.codecs}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#1c1814] text-xs text-slate-600 dark:text-slate-300">
              Single-track live/VOD stream playlist. FFmpeg will capture and mux segments into MP4.
            </div>
          )}

          <div className="pt-4 border-t border-[#EEDDC8]/60 dark:border-[#3A332B] flex items-center justify-end">
            <button
              onClick={handleStartDownload}
              disabled={downloading}
              className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-white font-bold text-sm shadow-lg shadow-amber-500/30 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>Capture & Save Stream</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
