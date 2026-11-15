import React, { useEffect, useRef, useState } from 'react';
import { Clapperboard, Download, FileCode2, FileText, Globe, Presentation, Volume2 } from 'lucide-react';
import type { StudioArtifact } from '../types/jarvis';

interface StudioPanelProps {
  artifacts: StudioArtifact[];
  onGenerate: (params: {
    type: StudioArtifact['type'];
    topic: string;
    language: string;
    includeVoiceover: boolean;
  }) => Promise<StudioArtifact>;
}

const STUDIO_TYPES: { id: StudioArtifact['type']; label: string; icon: React.ReactNode }[] = [
  { id: 'youtube_video', label: 'YouTube Video Pipeline', icon: <Clapperboard className="w-4 h-4" /> },
  { id: 'document', label: 'Document', icon: <FileText className="w-4 h-4" /> },
  { id: 'presentation', label: 'Presentation', icon: <Presentation className="w-4 h-4" /> },
  { id: 'website', label: 'Website', icon: <Globe className="w-4 h-4" /> },
  { id: 'android_code', label: 'Android / Code', icon: <FileCode2 className="w-4 h-4" /> },
];

export const StudioPanel: React.FC<StudioPanelProps> = ({ artifacts, onGenerate }) => {
  const [selectedType, setSelectedType] = useState<StudioArtifact['type']>('youtube_video');
  const [topic, setTopic] = useState('');
  const [language, setLanguage] = useState('Hindi / Hinglish');
  const [includeVoiceover, setIncludeVoiceover] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeArtifact, setActiveArtifact] = useState<StudioArtifact | null>(
    artifacts[0] || null
  );
  const [error, setError] = useState<string | null>(null);
  const thumbCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!activeArtifact && artifacts.length > 0) {
      setActiveArtifact(artifacts[0]);
    }
  }, [artifacts, activeArtifact]);

  // Render crisp 1280x720 YouTube Thumbnail onto Canvas whenever activeArtifact changes
  useEffect(() => {
    const canvas = thumbCanvasRef.current;
    if (!canvas || !activeArtifact) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = 1280;
    const h = 720;
    canvas.width = w;
    canvas.height = h;

    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#090D16');
    grad.addColorStop(0.55, '#0F172A');
    grad.addColorStop(1, '#0C4A6E');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle geometric accent grid
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.lineWidth = 2;
    for (let x = 0; x < w; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Acoustic ring emblem on right
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(1020, 360, 170, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(224, 242, 254, 0.45)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(1020, 360, 120, 0, Math.PI * 2);
    ctx.stroke();

    // Headline text
    ctx.fillStyle = '#F8FAFC';
    ctx.font = 'bold 74px Outfit, sans-serif';
    const headline = (activeArtifact.thumbnailHeadline || activeArtifact.title).slice(0, 38);
    const words = headline.split(' ');
    let line = '';
    let y = 260;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > 740) {
        ctx.fillText(line, 84, y);
        line = word;
        y += 88;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, 84, y);

    // Subtext
    ctx.fillStyle = '#38BDF8';
    ctx.font = '600 34px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(
      (activeArtifact.thumbnailSubtext || activeArtifact.topic).slice(0, 56),
      84,
      y + 76
    );
  }, [activeArtifact]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    setError(null);
    setIsGenerating(true);
    try {
      const created = await onGenerate({
        type: selectedType,
        topic: topic.trim(),
        language,
        includeVoiceover,
      });
      setActiveArtifact(created);
      setTopic('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Creation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadText = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadThumbnailPng = () => {
    const canvas = thumbCanvasRef.current;
    if (!canvas || !activeArtifact) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeArtifact.id}_thumbnail.png`;
    a.click();
  };

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-800/80 bg-[#0F172A]/85 p-6">
        <div className="pb-5 border-b border-slate-800/80">
          <h2 className="font-display text-xl font-semibold text-slate-100">
            AI Creation Studio
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Generate YouTube scripts, SRT subtitles, Hindi WAV voiceovers, 1280×720 thumbnails, documents, websites, and Android code
          </p>
        </div>

        {/* Type Selector */}
        <div className="mt-5 flex flex-wrap gap-2">
          {STUDIO_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedType(t.id)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-medium transition-colors min-h-[40px] whitespace-nowrap ${
                selectedType === t.id
                  ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                  : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleCreate} className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-3">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder='Example: "India mein 2026 ke top 5 AI startups par YouTube video banao"'
            className="md:col-span-6 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none min-h-[44px]"
          />
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="md:col-span-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 min-h-[44px]"
          >
            <option value="Hindi / Hinglish">Hindi / Hinglish</option>
            <option value="Pure Hindi">Pure Hindi</option>
            <option value="English">English</option>
          </select>
          <label className="md:col-span-2 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs text-slate-300 min-h-[44px] cursor-pointer">
            <input
              type="checkbox"
              checked={includeVoiceover}
              onChange={(e) => setIncludeVoiceover(e.target.checked)}
              className="accent-sky-400"
            />
            <span>WAV Voiceover</span>
          </label>
          <button
            type="submit"
            disabled={isGenerating || !topic.trim()}
            className="md:col-span-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-50 transition-colors min-h-[44px] whitespace-nowrap"
          >
            {isGenerating ? 'Creating…' : 'Generate'}
          </button>
        </form>

        {error && (
          <p className="mt-3 text-xs text-rose-400">{error}</p>
        )}
      </section>

      {activeArtifact && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-7 rounded-2xl border border-slate-800/80 bg-[#0F172A]/85 p-6 flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
              <div>
                <span className="text-xs font-mono text-sky-400">
                  {activeArtifact.type} · {activeArtifact.language}
                </span>
                <h3 className="mt-1 font-display text-lg font-semibold text-slate-100">
                  {activeArtifact.title}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    downloadText(`${activeArtifact.id}.md`, activeArtifact.scriptMarkdown)
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 min-h-[36px]"
                >
                  <Download className="w-3.5 h-3.5" />
                  Script
                </button>
                {activeArtifact.subtitlesSrt && (
                  <button
                    type="button"
                    onClick={() =>
                      downloadText(`${activeArtifact.id}.srt`, activeArtifact.subtitlesSrt || '')
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 min-h-[36px]"
                  >
                    <Download className="w-3.5 h-3.5" />
                    SRT
                  </button>
                )}
              </div>
            </div>

            <pre className="mt-4 flex-1 max-h-[420px] overflow-auto rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed font-sans">
              {activeArtifact.scriptMarkdown}
            </pre>
          </div>

          <div className="lg:col-span-5 rounded-2xl border border-slate-800/80 bg-[#0F172A]/85 p-6 flex flex-col justify-between gap-5">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                <h3 className="font-display text-base font-semibold text-slate-100">
                  1280×720 Thumbnail Preview
                </h3>
                <button
                  type="button"
                  onClick={downloadThumbnailPng}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 min-h-[36px]"
                >
                  <Download className="w-3.5 h-3.5" />
                  PNG
                </button>
              </div>

              <canvas
                ref={thumbCanvasRef}
                className="mt-4 w-full aspect-video rounded-xl border border-slate-800"
              />
            </div>

            <div>
              <h4 className="text-xs font-medium text-slate-300 flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-sky-400" />
                Hindi / Hinglish Studio Voiceover (WAV)
              </h4>
              {activeArtifact.hasVoiceover ? (
                <div className="mt-2 space-y-2">
                  <audio
                    controls
                    src={`/api/studio/${activeArtifact.id}/audio.wav`}
                    className="w-full h-10"
                  />
                  <a
                    href={`/api/studio/${activeArtifact.id}/audio.wav`}
                    download={`${activeArtifact.id}.wav`}
                    className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:underline"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download .WAV Voiceover
                  </a>
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  Voiceover not attached for this item. Enable “WAV Voiceover” when generating.
                </p>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
