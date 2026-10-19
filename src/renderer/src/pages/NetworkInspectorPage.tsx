import React, { useState } from 'react';
import {
  Radio,
  FileCode,
  Search,
  Upload,
  ShieldCheck,
  Download,
  ExternalLink,
  AlertCircle,
  FileVideo,
  FileAudio,
  FileText,
  Layers,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import { downloadService, HarCandidate } from '@api/index';

interface NetworkInspectorPageProps {
  onJobStarted: () => void;
}

export const NetworkInspectorPage: React.FC<NetworkInspectorPageProps> = ({ onJobStarted }) => {
  const [activeSubTab, setActiveSubTab] = useState<'har' | 'manual' | 'extension'>('har');

  // HAR State
  const [harLoading, setHarLoading] = useState(false);
  const [harError, setHarError] = useState<string | null>(null);
  const [harCandidates, setHarCandidates] = useState<HarCandidate[]>([]);
  const [harFilename, setHarFilename] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Manual Probe State
  const [manualUrl, setManualUrl] = useState('');
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [probeResult, setProbeResult] = useState<any | null>(null);

  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setHarLoading(true);
    setHarError(null);
    try {
      const res = await downloadService.uploadHar(file);
      setHarCandidates(res.candidates);
      setHarFilename(res.filename);
    } catch (err: any) {
      setHarError(err.message || 'Failed to process HAR file.');
    } finally {
      setHarLoading(false);
    }
  };

  const handleProbe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualUrl.trim()) return;

    setProbeLoading(true);
    setProbeError(null);
    setProbeResult(null);

    try {
      const res = await downloadService.probeUrl(manualUrl.trim());
      setProbeResult(res);
    } catch (err: any) {
      setProbeError(err.message || 'Failed to inspect URL.');
    } finally {
      setProbeLoading(false);
    }
  };

  const handleDownloadCandidate = async (candidate: HarCandidate) => {
    try {
      await downloadService.createJob({
        url: candidate.original_url || candidate.url,
        title: candidate.suggested_filename,
        source: candidate.is_stream ? 'HLS' : 'Direct',
        ext: candidate.suggested_filename.split('.').pop() || 'mp4',
      });
      setDownloadSuccess(`Queued "${candidate.suggested_filename}" for download!`);
      setTimeout(() => setDownloadSuccess(null), 4000);
      onJobStarted();
    } catch (err: any) {
      alert(`Could not start download: ${err.message}`);
    }
  };

  const filteredCandidates = harCandidates.filter((cand) => {
    if (typeFilter === 'all') return true;
    if (typeFilter === 'stream') return cand.is_stream;
    if (typeFilter === 'video') return cand.type.toLowerCase().includes('video');
    if (typeFilter === 'audio') return cand.type.toLowerCase().includes('audio');
    if (typeFilter === 'doc') return cand.type.toLowerCase().includes('pdf') || cand.type.toLowerCase().includes('doc');
    return true;
  });

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white font-['Outfit']">
            Network Inspector
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Sniff and capture hidden HLS streams, DASH manifests, and media segments from browser sessions.
          </p>
        </div>

        {/* Sub-tab navigation */}
        <div className="flex items-center gap-1 p-1 rounded-2xl bg-white dark:bg-[#24201B] border border-[#EEDDC8] dark:border-[#3A332B] shadow-warm-sm">
          <button
            onClick={() => setActiveSubTab('har')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeSubTab === 'har'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Import HAR</span>
          </button>
          <button
            onClick={() => setActiveSubTab('manual')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeSubTab === 'manual'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Manual URL Probe</span>
          </button>
          <button
            onClick={() => setActiveSubTab('extension')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeSubTab === 'extension'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Extension Guide</span>
          </button>
        </div>
      </div>

      {downloadSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 flex items-center gap-3 text-emerald-700 dark:text-emerald-300 text-sm">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <p className="font-semibold">{downloadSuccess}</p>
        </div>
      )}

      {/* Mode A: Import HAR */}
      {activeSubTab === 'har' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#24201B] p-6 rounded-3xl border border-[#EEDDC8] dark:border-[#3A332B] shadow-warm space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Outfit']">
                  Upload DevTools HAR File
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Export a .har file from Chrome or Firefox Network DevTools tab. LabDownloader automatically redacts credentials, cookies, and tokens before scanning.
                </p>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/60 dark:border-emerald-800/40 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Zero Token Retention</span>
              </div>
            </div>

            <label className="border-2 border-dashed border-[#EEDDC8] dark:border-[#3A332B] hover:border-amber-400 dark:hover:border-amber-500 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer bg-[#FFF6E8]/30 dark:bg-[#1c1814]/40 transition-colors">
              <input
                type="file"
                accept=".har,application/json"
                onChange={handleFileUpload}
                className="hidden"
                disabled={harLoading}
              />
              <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-3">
                {harLoading ? (
                  <div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Upload className="w-6 h-6" />
                )}
              </div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                {harLoading ? 'Parsing & Sanitizing HAR...' : 'Drop HAR file here or click to browse'}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Supports Chrome, Edge, and Firefox DevTools HAR exports (.har)
              </p>
            </label>

            {harError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{harError}</span>
              </div>
            )}
          </div>

          {/* HAR Candidate List */}
          {harCandidates.length > 0 && (
            <div className="bg-white dark:bg-[#24201B] p-6 rounded-3xl border border-[#EEDDC8] dark:border-[#3A332B] shadow-warm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EEDDC8]/60 dark:border-[#3A332B] pb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white font-['Outfit']">
                    Detected Media Streams & Files ({filteredCandidates.length})
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">Source: {harFilename}</p>
                </div>

                {/* Filter chips */}
                <div className="flex items-center gap-1.5 text-xs">
                  <Filter className="w-3.5 h-3.5 text-slate-400 mr-1" />
                  {['all', 'stream', 'video', 'audio', 'doc'].map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setTypeFilter(filter)}
                      className={`px-2.5 py-1 rounded-lg capitalize font-medium transition-colors ${
                        typeFilter === filter
                          ? 'bg-amber-500 text-white'
                          : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-[#EEDDC8]/50 dark:divide-[#3A332B]/50 max-h-96 overflow-y-auto pr-1">
                {filteredCandidates.map((cand) => (
                  <div key={cand.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0 border border-amber-200/50">
                        {cand.is_stream ? (
                          <Layers className="w-4 h-4" />
                        ) : cand.type.includes('Audio') ? (
                          <FileAudio className="w-4 h-4" />
                        ) : (
                          <FileVideo className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                            {cand.suggested_filename}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                            {cand.type}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {cand.size_formatted}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate max-w-lg mt-0.5">
                          {cand.url}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDownloadCandidate(cand)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs shadow-sm flex-shrink-0 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mode B: Manual URL Probe */}
      {activeSubTab === 'manual' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#24201B] p-6 rounded-3xl border border-[#EEDDC8] dark:border-[#3A332B] shadow-warm space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Outfit']">
                Direct URL Inspection & Probe
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Safely inspect any suspicious link. LabDownloader performs SSRF validation, tests HTTP status, detects HLS/DASH playlists, and checks download eligibility.
              </p>
            </div>

            <form onSubmit={handleProbe} className="flex gap-2">
              <input
                type="text"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="Enter suspected .m3u8, .mpd, or direct media URL..."
                className="flex-1 px-4 py-3 rounded-2xl bg-[#FFF6E8]/50 dark:bg-[#181512]/60 border border-[#EEDDC8]/80 dark:border-[#3A332B] text-slate-800 dark:text-slate-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
              <button
                type="submit"
                disabled={probeLoading || !manualUrl.trim()}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-sm transition-colors disabled:opacity-50"
              >
                {probeLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                <span>Inspect</span>
              </button>
            </form>

            {probeError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{probeError}</span>
              </div>
            )}
          </div>

          {probeResult && (
            <div className="bg-white dark:bg-[#24201B] p-6 rounded-3xl border border-[#EEDDC8] dark:border-[#3A332B] shadow-warm space-y-4 animate-in fade-in duration-200">
              <div className="flex items-start justify-between">
                <div>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    HTTP {probeResult.status} OK
                  </span>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1">
                    {probeResult.detected_type}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5 break-all">
                    {probeResult.url}
                  </p>
                </div>
                <button
                  onClick={() =>
                    handleDownloadCandidate({
                      id: 'manual',
                      url: probeResult.url,
                      original_url: probeResult.original_url,
                      method: 'GET',
                      status: probeResult.status,
                      mime_type: probeResult.content_type,
                      type: probeResult.detected_type,
                      size_formatted: probeResult.content_length_formatted,
                      suggested_filename: probeResult.suggested_filename,
                      is_stream: probeResult.is_stream,
                      can_download: true,
                    })
                  }
                  className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-md shadow-amber-500/25 transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Resource</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#1b1713] border border-[#EEDDC8]/50 dark:border-[#3A332B]">
                  <span className="text-slate-400 block text-[10px]">Content-Type</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200 truncate block mt-0.5">
                    {probeResult.content_type}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#1b1713] border border-[#EEDDC8]/50 dark:border-[#3A332B]">
                  <span className="text-slate-400 block text-[10px]">Resource Size</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200 block mt-0.5">
                    {probeResult.content_length_formatted}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#1b1713] border border-[#EEDDC8]/50 dark:border-[#3A332B]">
                  <span className="text-slate-400 block text-[10px]">Stream Detection</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200 block mt-0.5">
                    {probeResult.is_stream ? 'Yes (HLS/DASH)' : 'Direct File'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#1b1713] border border-[#EEDDC8]/50 dark:border-[#3A332B]">
                  <span className="text-slate-400 block text-[10px]">Eligibility</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 block mt-0.5">
                    Ready to Download
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mode C: Extension Guide */}
      {activeSubTab === 'extension' && (
        <div className="bg-white dark:bg-[#24201B] p-6 rounded-3xl border border-[#EEDDC8] dark:border-[#3A332B] shadow-warm space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Outfit']">
                LabDownloader Sniffer Companion Extension
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Architecture & user-controlled browser integration design
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 text-xs text-slate-700 dark:text-slate-300 space-y-2 leading-relaxed">
            <p className="font-semibold text-amber-800 dark:text-amber-300">
              How the companion extension operates securely:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-400">
              <li>
                <strong>Opt-in Sniffing:</strong> Uses Chrome's <code>declarativeNetRequest</code> and <code>webRequest</code> APIs only when the user explicitly clicks the browser action icon.
              </li>
              <li>
                <strong>Zero Remote Exfiltration:</strong> Stream candidates are sent directly to your local loopback LabDownloader engine (<code>127.0.0.1:52174</code>) using the authenticated token.
              </li>
              <li>
                <strong>Credentials Sanitization:</strong> Authentication cookies, session tokens, and passwords are permanently stripped before candidates are displayed.
              </li>
              <li>
                <strong>DRM Respect:</strong> Protected Widevine/PlayReady streams are detected and flagged so user permissions and rights remain fully respected.
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
