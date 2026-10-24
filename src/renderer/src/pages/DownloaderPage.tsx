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
  ListFilter,
  Copy,
  Trash2,
  ExternalLink,
  FileDown,
} from 'lucide-react';
import { downloadService, MediaInfo, StreamInfo } from '@api/index';
import {
  extractLinksFromText,
  ExtractedLinkItem,
  ExtractionResult,
} from '../utils/linkExtractor';

interface DownloaderPageProps {
  onJobStarted: () => void;
  defaultDownloadDir: string;
}

type DownloadMode = 'single' | 'batch';

const SAMPLE_INPUT = `Day 1 Bedah [https://youtu.be/gl49EOm1p8o](https://youtu.be/gl49EOm1p8o)
Day 2 Kardio Pulmo [https://youtu.be/8GavENOqILY](https://youtu.be/8GavENOqILY)
Day 3 Interna 1 [https://youtu.be/bJUW7E9150s](https://youtu.be/bJUW7E9150s)
Day 4 Interna 2 [https://youtu.be/WdEjF52CbSY](https://youtu.be/WdEjF52CbSY)
Day 5 Obgyn [https://youtu.be/U-EwM4QP5As](https://youtu.be/U-EwM4QP5As)
Day 6 Pediatri [https://youtu.be/loFF9Yx8H0I](https://youtu.be/loFF9Yx8H0I)
Day 7 Mata THT [https://youtu.be/N9TuEw08Dpg](https://youtu.be/N9TuEw08Dpg)
Day 8 Non Sistem [https://youtu.be/bxidTY2Bpmc](https://youtu.be/bxidTY2Bpmc)
Day 9 Kulit Kelamin [https://youtu.be/FMuyDwMzfps](https://youtu.be/FMuyDwMzfps)
Day 10 Neuro Psiki [https://youtu.be/VNk3eUoiUhM](https://youtu.be/VNk3eUoiUhM)`;

const BATCH_FORMAT_PRESETS = [
  { id: 'bestvideo+bestaudio/best', ext: 'mp4', label: 'Best Video (MP4)', desc: 'Original high-def video' },
  { id: 'bestvideo[height<=1080]+bestaudio/best', ext: 'mp4', label: '1080p FHD (MP4)', desc: 'Balanced 1080p MP4' },
  { id: 'bestaudio/best', ext: 'mp3', label: 'Audio MP3', desc: '192kbps MP3 audio only' },
  { id: 'bestaudio/best', ext: 'm4a', label: 'Audio M4A / AAC', desc: 'High-fidelity audio stream' },
];

export const DownloaderPage: React.FC<DownloaderPageProps> = ({ onJobStarted, defaultDownloadDir }) => {
  const [mode, setMode] = useState<DownloadMode>('single');

  // Single mode state
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

  // Batch mode state
  const [batchText, setBatchText] = useState('');
  const [extractionStats, setExtractionStats] = useState<ExtractionResult>({
    items: [],
    totalRawDetected: 0,
    uniqueCount: 0,
    duplicateCount: 0,
  });
  const [batchItems, setBatchItems] = useState<ExtractedLinkItem[]>([]);
  const [batchFormat, setBatchFormat] = useState(BATCH_FORMAT_PRESETS[0]);
  const [batchDownloading, setBatchDownloading] = useState(false);
  const [batchProgressMsg, setBatchProgressMsg] = useState<string | null>(null);

  // Parse text for batch mode
  const handleBatchTextChange = (text: string) => {
    setBatchText(text);
    const res = extractLinksFromText(text);
    setExtractionStats(res);
    setBatchItems(res.items);
    setError(null);
  };

  // Smart single input handler: auto-switch to batch if multiple URLs or lines detected
  const processSingleInput = (inputVal: string) => {
    const lines = inputVal.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const urlMatches = inputVal.match(/https?:\/\//gi) || [];

    if (lines.length > 1 || urlMatches.length > 1) {
      setMode('batch');
      handleBatchTextChange(inputVal);
      setSuccessMsg(`Detected ${urlMatches.length} links! Switched to Multi-Link Batch Mode.`);
      setTimeout(() => setSuccessMsg(null), 3500);
      return;
    }
    setUrl(inputVal);
    setError(null);
  };

  const handlePasteSingle = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        processSingleInput(text.trim());
      }
    } catch (_) {
      setError('Could not access clipboard. Please paste manually with Ctrl+V.');
    }
  };

  const handlePasteBatch = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        handleBatchTextChange(text.trim());
      }
    } catch (_) {
      setError('Could not access clipboard. Please paste manually with Ctrl+V.');
    }
  };

  const handleClearSingle = () => {
    setUrl('');
    setError(null);
    setSuccessMsg(null);
    setAnalyzedType(null);
    setMediaData(null);
    setStreamData(null);
  };

  const handleClearBatch = () => {
    setBatchText('');
    setExtractionStats({ items: [], totalRawDetected: 0, uniqueCount: 0, duplicateCount: 0 });
    setBatchItems([]);
    setError(null);
    setSuccessMsg(null);
  };

  const handleLoadSample = () => {
    handleBatchTextChange(SAMPLE_INPUT);
    setSuccessMsg('Sample medical review links loaded! (10 unique videos, duplicates deduplicated)');
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const handleUpdateItemTitle = (index: number, newTitle: string) => {
    setBatchItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], title: newTitle };
      return updated;
    });
  };

  const handleRemoveItem = (index: number) => {
    setBatchItems((prev) => prev.filter((_, i) => i !== index));
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

  const handleStartDownloadSingle = async () => {
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

  const handleStartBatchDownload = async () => {
    if (batchItems.length === 0) return;
    setBatchDownloading(true);
    setError(null);
    setBatchProgressMsg(`Queueing ${batchItems.length} downloads...`);

    try {
      const payload = batchItems.map((item) => ({
        url: item.url,
        title: item.title,
        source: item.source,
        format_id: batchFormat.id,
        ext: batchFormat.ext,
      }));

      let totalQueued = 0;
      if (typeof downloadService.createBatchJobs === 'function') {
        const res = await downloadService.createBatchJobs(payload);
        totalQueued = res.total_queued;
      } else {
        for (const p of payload) {
          await downloadService.createJob(p);
          totalQueued++;
        }
      }

      setSuccessMsg(`Berhasil menambahkan ${totalQueued} link ke antrean download!`);
      setTimeout(() => setSuccessMsg(null), 4000);
      onJobStarted();
    } catch (err: any) {
      setError(err.message || 'Gagal memulai batch download.');
    } finally {
      setBatchDownloading(false);
      setBatchProgressMsg(null);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Hero Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-semibold bg-amber-100/90 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/40 shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span>Universal High-Speed Downloader</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white font-['Outfit']">
          Download media & streams with ease
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
          Paste single links or entire lists of links from YouTube, Twitter/X, Instagram, TikTok, Scribd, or streams.
        </p>

        {/* Mode Toggle Switcher */}
        <div className="pt-2 flex justify-center">
          <div className="inline-flex p-1 rounded-2xl bg-[#F4E8D8]/80 dark:bg-[#1E1915] border border-[#EEDDC8] dark:border-[#3A332B] shadow-inner">
            <button
              type="button"
              onClick={() => setMode('single')}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all ${
                mode === 'single'
                  ? 'bg-white dark:bg-[#2b251f] text-amber-900 dark:text-amber-200 shadow-warm-sm border border-amber-200/40 dark:border-amber-900/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Link className="w-3.5 h-3.5 text-amber-500" />
              <span>Single Link</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('batch')}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all ${
                mode === 'batch'
                  ? 'bg-white dark:bg-[#2b251f] text-amber-900 dark:text-amber-200 shadow-warm-sm border border-amber-200/40 dark:border-amber-900/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ListFilter className="w-3.5 h-3.5 text-amber-500" />
              <span>Multi-Link & Batch</span>
              <span className="px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 text-[10px] font-extrabold tracking-wide uppercase border border-amber-300/40 dark:border-amber-700/40">
                Deduplikasi Pintar
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* SINGLE LINK MODE */}
      {mode === 'single' && (
        <div className="bg-white dark:bg-[#24201B] p-5 rounded-3xl border border-[#EEDDC8] dark:border-[#3A332B] shadow-warm space-y-4">
          <form onSubmit={handleAnalyze} className="space-y-4">
            <div className="relative flex items-center">
              <div className="absolute left-4 text-amber-500">
                <Link className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={url}
                onChange={(e) => processSingleInput(e.target.value)}
                placeholder="Paste video, audio, HLS .m3u8, or direct file URL (auto-detects batch lists)..."
                className="w-full pl-12 pr-28 py-4 rounded-2xl bg-[#FFF6E8]/50 dark:bg-[#181512]/60 border border-[#EEDDC8]/80 dark:border-[#3A332B] text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm font-medium transition-all"
              />
              <div className="absolute right-3 flex items-center gap-1.5">
                {url && (
                  <button
                    type="button"
                    onClick={handleClearSingle}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    title="Clear"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handlePasteSingle}
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
                className="flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-white font-bold text-sm shadow-md shadow-amber-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99]"
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
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-start gap-3 text-rose-700 dark:text-rose-300 text-sm">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Analysis Failed</p>
                <p className="text-xs mt-0.5 text-rose-600 dark:text-rose-400">{error}</p>
              </div>
            </div>
          )}

          {successMsg && (
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 flex items-center gap-3 text-emerald-700 dark:text-emerald-300 text-sm">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <p className="font-semibold">{successMsg}</p>
            </div>
          )}
        </div>
      )}

      {/* MULTI-LINK & BATCH MODE */}
      {mode === 'batch' && (
        <div className="bg-white dark:bg-[#24201B] p-6 rounded-3xl border border-[#EEDDC8] dark:border-[#3A332B] shadow-warm space-y-6">
          {/* Header & Controls toolbar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 font-['Outfit']">
                <ListFilter className="w-4 h-4 text-amber-500" />
                <span>Multi-Link Extractor & Batch Download</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Paste teks bebas atau markdown. Sistem otomatis mendeteksi link, menyaring link ganda, dan mengambil judulnya.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleLoadSample}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 border border-amber-200 dark:border-amber-800/40 transition-colors shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Load Contoh (10 Day)</span>
              </button>
              <button
                type="button"
                onClick={handlePasteBatch}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-[#2d2822] hover:bg-amber-50 dark:hover:bg-[#363028] border border-[#EEDDC8] dark:border-[#3A332B] transition-colors shadow-sm"
              >
                <ClipboardPaste className="w-3.5 h-3.5 text-amber-500" />
                <span>Paste Teks</span>
              </button>
              {batchText && (
                <button
                  type="button"
                  onClick={handleClearBatch}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-rose-500 transition-colors"
                  title="Clear text"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>

          {/* Textarea Input */}
          <div className="relative">
            <textarea
              rows={6}
              value={batchText}
              onChange={(e) => handleBatchTextChange(e.target.value)}
              placeholder={`Tempel daftar link atau pesan chat di sini...\nContoh:\nDay 1 Bedah [https://youtu.be/gl49EOm1p8o](https://youtu.be/gl49EOm1p8o)\nDay 2 Kardio Pulmo [https://youtu.be/8GavENOqILY](https://youtu.be/8GavENOqILY)\n...`}
              className="w-full p-4 rounded-2xl bg-[#FFF6E8]/50 dark:bg-[#181512]/60 border border-[#EEDDC8]/80 dark:border-[#3A332B] text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-xs font-mono transition-all resize-y"
            />
          </div>

          {/* Extraction & Deduplication Statistics Cards */}
          {batchText.trim().length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Unique Links */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/40 dark:from-emerald-950/30 dark:to-emerald-900/10 border border-emerald-200/80 dark:border-emerald-800/40">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    Link Unik Siap Download
                  </span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-emerald-900 dark:text-emerald-200">
                    {batchItems.length}
                  </span>
                  <span className="text-xs text-emerald-700/80 dark:text-emerald-400 font-medium">
                    video/dokumen unik
                  </span>
                </div>
              </div>

              {/* Duplicate Filtered */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-amber-100/40 dark:from-amber-950/30 dark:to-amber-900/10 border border-amber-200/80 dark:border-amber-800/40">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                    Link Ganda Disaring
                  </span>
                  <Copy className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-amber-900 dark:text-amber-200">
                    {extractionStats.duplicateCount}
                  </span>
                  <span className="text-xs text-amber-700/80 dark:text-amber-400 font-medium">
                    hanya dihitung 1 kali
                  </span>
                </div>
              </div>

              {/* Total Mentions */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#1a1714] border border-[#EEDDC8]/80 dark:border-[#3A332B]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Total Tautan di Teks
                  </span>
                  <Layers className="w-4 h-4 text-slate-400" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-slate-800 dark:text-slate-200">
                    {extractionStats.totalRawDetected}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    kemunculan URL
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Feedback messages */}
          {error && (
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-start gap-3 text-rose-700 dark:text-rose-300 text-sm">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Batch Download Gagal</p>
                <p className="text-xs mt-0.5 text-rose-600 dark:text-rose-400">{error}</p>
              </div>
            </div>
          )}

          {successMsg && (
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 flex items-center gap-3 text-emerald-700 dark:text-emerald-300 text-sm">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <p className="font-semibold">{successMsg}</p>
            </div>
          )}

          {/* Extracted Items List & Options */}
          {batchItems.length > 0 && (
            <div className="space-y-4 pt-2 border-t border-[#EEDDC8]/60 dark:border-[#3A332B]">
              {/* Batch Format Selection Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5 text-amber-500" />
                    <span>Pilih Format Download untuk Semua Link:</span>
                  </label>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Format berlaku serentak ke semua {batchItems.length} item
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {BATCH_FORMAT_PRESETS.map((p) => {
                    const isSelected = batchFormat.id === p.id && batchFormat.ext === p.ext;
                    return (
                      <button
                        key={`${p.id}-${p.ext}`}
                        type="button"
                        onClick={() => setBatchFormat(p)}
                        className={`p-3 rounded-2xl text-left border transition-all flex items-center justify-between ${
                          isSelected
                            ? 'border-amber-500 bg-amber-50/80 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 ring-2 ring-amber-500/20 shadow-sm'
                            : 'border-[#EEDDC8]/80 dark:border-[#3A332B] hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {p.ext === 'mp3' || p.ext === 'm4a' ? (
                            <Music className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                          ) : (
                            <Video className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                          )}
                          <div>
                            <p className="text-xs font-bold">{p.label}</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">{p.desc}</p>
                          </div>
                        </div>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Extracted Items Scroll Container */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Daftar Link yang Teridentifikasi ({batchItems.length} item):
                  </span>
                  <span>Anda dapat mengedit judul atau menghapus item yang tidak diinginkan</span>
                </div>

                <div className="max-h-72 overflow-y-auto space-y-2 pr-1 rounded-2xl border border-[#EEDDC8]/60 dark:border-[#3A332B] p-2 bg-[#FAF3EA]/40 dark:bg-[#191613]/50">
                  {batchItems.map((item, idx) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl bg-white dark:bg-[#221e1a] border border-[#EEDDC8]/80 dark:border-[#3A332B] shadow-sm flex items-center justify-between gap-3 group hover:border-amber-400/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 text-xs font-bold flex items-center justify-center flex-shrink-0">
                          {idx + 1}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100/80 dark:bg-amber-950 text-amber-800 dark:text-amber-300 flex-shrink-0">
                              {item.source}
                            </span>
                            <input
                              type="text"
                              value={item.title}
                              onChange={(e) => handleUpdateItemTitle(idx, e.target.value)}
                              className="font-bold text-xs text-slate-900 dark:text-white bg-transparent border-b border-transparent hover:border-amber-300 dark:hover:border-amber-700 focus:border-amber-500 focus:outline-none w-full truncate transition-colors py-0.5"
                              title="Klik untuk mengubah judul download"
                            />
                          </div>

                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                              {item.url}
                            </span>
                            {item.duplicateCount > 0 && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-violet-100 dark:bg-violet-950/80 text-violet-700 dark:text-violet-300 flex-shrink-0">
                                {item.duplicateCount} duplikat disaring
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 transition-colors"
                          title="Buka link di browser"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                          title="Hapus dari daftar download"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Bottom Bar */}
              <div className="pt-4 border-t border-[#EEDDC8]/60 dark:border-[#3A332B] flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <FolderOpen className="w-4 h-4 text-amber-500" />
                  <span>Menyimpan ke:</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200 font-medium truncate max-w-xs">
                    {defaultDownloadDir}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleStartBatchDownload}
                  disabled={batchDownloading || batchItems.length === 0}
                  className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-white font-bold text-sm shadow-lg shadow-amber-500/30 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                >
                  {batchDownloading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>{batchProgressMsg || 'Memproses Download...'}</span>
                    </>
                  ) : (
                    <>
                      <FileDown className="w-4 h-4" />
                      <span>Download Semua {batchItems.length} Link Sekaligus</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SINGLE LINK: Media or Document Analysis Result Preview Card */}
      {mode === 'single' && (analyzedType === 'media' || analyzedType === 'document') && mediaData && (
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
              onClick={handleStartDownloadSingle}
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

      {/* SINGLE LINK: Stream Manifest Result Preview Card */}
      {mode === 'single' && analyzedType === 'stream' && streamData && (
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
              onClick={handleStartDownloadSingle}
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
