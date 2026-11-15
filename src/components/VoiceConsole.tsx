import React, { useRef, useState } from 'react';
import {
  AudioLines,
  ExternalLink,
  Lock,
  Mic,
  MicOff,
  Radio,
  Send,
  Square,
  Trash2,
  Volume2,
} from 'lucide-react';
import type { ChatMessage, JarvisSettings, VoiceOrbState } from '../types/jarvis';
import { AcousticOrb } from './AcousticOrb';

interface VoiceConsoleProps {
  messages: ChatMessage[];
  settings: JarvisSettings;
  orbState: VoiceOrbState;
  audioLevel: number;
  liveConnected: boolean;
  wakeListenerActive: boolean;
  liveError: string | null;
  interimTranscript: string;
  isSending: boolean;
  onToggleLive: () => void;
  onToggleWakeListener: () => void;
  onStopAll: () => void;
  onSendMessage: (text: string) => void;
  onReplayTts: (text: string) => void;
  onClearMessages: () => void;
  onUpdateSettings: (patch: Partial<JarvisSettings>) => void;
  onOpenLockScreen: () => void;
  onTranscribeBlob: (blob: Blob) => Promise<void>;
  onAcquireMicStream: () => Promise<MediaStream>;
  onReleaseVoiceNoteMic: () => void;
}

const VOICE_COMMANDS = [
  'Aaj mausam kaisa hai?',
  'Roz subah 7 baje exercise ka reminder lagao',
  'Mere liye ek YouTube video bana do',
  'Jarvis, Hindi mein jawab do',
  'Jarvis, thoda detail mein samjhao',
];

export const VoiceConsole: React.FC<VoiceConsoleProps> = ({
  messages,
  settings,
  orbState,
  audioLevel,
  liveConnected,
  wakeListenerActive,
  liveError,
  interimTranscript,
  isSending,
  onToggleLive,
  onToggleWakeListener,
  onStopAll,
  onSendMessage,
  onReplayTts,
  onClearMessages,
  onUpdateSettings,
  onOpenLockScreen,
  onTranscribeBlob,
  onAcquireMicStream,
  onReleaseVoiceNoteMic,
}) => {
  const [draft, setDraft] = useState('');
  const [isRecordingClip, setIsRecordingClip] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || isSending) return;
    onSendMessage(draft.trim());
    setDraft('');
  };

  const toggleVoiceNoteRecorder = async () => {
    if (isRecordingClip && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecordingClip(false);
      return;
    }
    try {
      const stream = await onAcquireMicStream();
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      mr.onstop = async () => {
        onReleaseVoiceNoteMic();
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        await onTranscribeBlob(blob);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setIsRecordingClip(true);
    } catch {
      onReleaseVoiceNoteMic();
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      {/* Left Column: Acoustic Orb & Voice Engine Controls */}
      <section className="lg:col-span-5 flex flex-col justify-between rounded-2xl border border-slate-800/80 bg-[#0F172A]/85 p-6">
        <div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-semibold text-slate-50 text-balance">
                Hindi Voice Companion
              </h1>
              <p className="mt-1 text-xs text-slate-400">
                Gemini Live 3.8 · Hindi-First · Hands-Free Wake Word
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenLockScreen}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
            >
              <Lock className="w-3.5 h-3.5 text-sky-400" />
              Lock Screen
            </button>
          </div>

          <div className="my-6">
            <AcousticOrb
              state={orbState}
              audioLevel={audioLevel}
              onClick={onToggleLive}
            />
          </div>

          {interimTranscript && (
            <div className="mb-4 rounded-xl border border-sky-500/30 bg-sky-950/30 px-4 py-2.5 text-xs text-sky-200">
              Hearing: “{interimTranscript}”
            </div>
          )}

          {liveError && (
            <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-2.5 text-xs text-rose-200">
              {liveError}
            </div>
          )}

          {/* Primary Voice Action Row */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onToggleLive}
              className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-colors min-h-[44px] whitespace-nowrap ${
                liveConnected
                  ? 'bg-rose-600 text-white hover:bg-rose-500'
                  : 'bg-sky-500 text-slate-950 hover:bg-sky-400'
              }`}
            >
              {liveConnected ? (
                <>
                  <MicOff className="w-4 h-4" />
                  Stop Live Voice
                </>
              ) : (
                <>
                  <Radio className="w-4 h-4" />
                  Start Live Voice
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onToggleWakeListener}
              className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors min-h-[44px] whitespace-nowrap ${
                wakeListenerActive
                  ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300'
                  : 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
              }`}
            >
              <AudioLines className="w-4 h-4" />
              {wakeListenerActive ? 'Wake Word Active' : 'Enable "Jarvis"'}
            </button>
          </div>

          {(orbState === 'speaking' || orbState === 'thinking' || liveConnected) && (
            <button
              type="button"
              onClick={onStopAll}
              className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-950/30 px-4 py-2.5 text-xs font-medium text-amber-200 hover:bg-amber-900/40 transition-colors min-h-[40px]"
            >
              <Square className="w-3.5 h-3.5" />
              Ruk Jao / Cancel Active Speech
            </button>
          )}
        </div>

        {/* Voice & Language Controls */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-400">Default Language</span>
              <select
                value={settings.defaultLanguage}
                onChange={(e) =>
                  onUpdateSettings({
                    defaultLanguage: e.target.value as 'hi' | 'hinglish' | 'en',
                  })
                }
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:border-sky-500 focus:outline-none min-h-[40px]"
              >
                <option value="hi">Hindi (हिन्दी)</option>
                <option value="hinglish">Hinglish (Natural Mix)</option>
                <option value="en">English (Auto-Hindi)</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-slate-400">Voice Persona</span>
              <select
                value={settings.voiceName}
                onChange={(e) =>
                  onUpdateSettings({
                    voiceName: e.target.value as JarvisSettings['voiceName'],
                  })
                }
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:border-sky-500 focus:outline-none min-h-[40px]"
              >
                <option value="Charon">Charon (Male — Deep &amp; Calm)</option>
                <option value="Fenrir">Fenrir (Male — Crisp &amp; Clear)</option>
                <option value="Puck">Puck (Male — Energetic)</option>
                <option value="Zephyr">Zephyr (Warm Companion)</option>
                <option value="Kore">Kore (Female — Clear)</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-slate-400">Emotion / Tone</span>
              <select
                value={settings.voiceTone || 'Calm'}
                onChange={(e) =>
                  onUpdateSettings({
                    voiceTone: e.target.value as JarvisSettings['voiceTone'],
                  })
                }
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:border-sky-500 focus:outline-none min-h-[40px]"
              >
                <option value="Calm">Calm (Composed)</option>
                <option value="Enthusiastic">Enthusiastic (Upbeat)</option>
                <option value="Formal">Formal (Executive)</option>
                <option value="Friendly">Friendly (Warm)</option>
                <option value="Empathetic">Empathetic (Caring)</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Wake Sensitivity</span>
                <span className="font-mono text-slate-200">
                  {Math.round(settings.wakeWordSensitivity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={settings.wakeWordSensitivity}
                onChange={(e) =>
                  onUpdateSettings({ wakeWordSensitivity: Number(e.target.value) })
                }
                className="mt-2 w-full accent-sky-400"
              />
            </label>

            <label className="block">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Speaking Speed</span>
                <span className="font-mono text-slate-200">
                  {settings.speechRate.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min={0.85}
                max={1.25}
                step={0.05}
                value={settings.speechRate}
                onChange={(e) =>
                  onUpdateSettings({ speechRate: Number(e.target.value) })
                }
                className="mt-2 w-full accent-sky-400"
              />
            </label>
          </div>
        </div>
      </section>

      {/* Right Column: Conversational Stream & Hindi Command Deck */}
      <section className="lg:col-span-7 flex flex-col rounded-2xl border border-slate-800/80 bg-[#0F172A]/85 p-6 min-h-[540px]">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-100">
              Live Conversation
            </h2>
            <p className="text-xs text-slate-400">
              Speak naturally in Hindi, Hinglish, or English · Barge-in supported
            </p>
          </div>
          <button
            type="button"
            onClick={onClearMessages}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 transition-colors min-h-[36px]"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>

        {/* Message Feed */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 max-h-[420px] pr-1">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12">
              <p className="text-sm text-slate-300">
                Koi baat shuru karein — “Jarvis, aaj mausam kaisa hai?”
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Tap Start Live Voice or use a quick Hindi command below.
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${
                  m.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-sky-500/15 border border-sky-500/30 text-slate-100'
                      : 'bg-slate-900/90 border border-slate-800 text-slate-200'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.text}</p>

                  {m.actionResult && (
                    <p className="mt-2 pt-2 border-t border-slate-800/80 text-xs font-mono text-sky-300">
                      Action: {m.actionResult}
                    </p>
                  )}

                  {m.groundingUrls && m.groundingUrls.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-800/80 flex flex-wrap gap-3">
                      {m.groundingUrls.map((link) => (
                        <a
                          key={link.uri}
                          href={link.uri}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-sky-400 hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {link.title}
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500 px-1">
                  <span>{m.role === 'user' ? 'You' : 'JARVIS'}</span>
                  {m.agentUsed && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{m.agentUsed} agent</span>
                    </>
                  )}
                  {m.providerUsed && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{m.providerUsed}</span>
                    </>
                  )}
                  {m.role === 'jarvis' && (
                    <>
                      <span aria-hidden="true">·</span>
                      <button
                        type="button"
                        onClick={() => onReplayTts(m.text)}
                        className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300"
                      >
                        <Volume2 className="w-3 h-3" />
                        Suno
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Quick Hindi Command Triggers */}
        <div className="pt-3 pb-3 border-t border-slate-800/80 flex gap-2 overflow-x-auto">
          {VOICE_COMMANDS.map((cmd) => (
            <button
              key={cmd}
              type="button"
              onClick={() => onSendMessage(cmd)}
              disabled={isSending}
              className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-300 hover:border-sky-500/40 hover:text-sky-200 transition-colors whitespace-nowrap shrink-0 min-h-[36px]"
            >
              {cmd}
            </button>
          ))}
        </div>

        {/* Input Composer */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={toggleVoiceNoteRecorder}
            aria-label={isRecordingClip ? 'Stop recording voice clip' : 'Record Hindi voice clip'}
            className={`flex items-center justify-center rounded-xl border min-w-[44px] min-h-[44px] transition-colors shrink-0 ${
              isRecordingClip
                ? 'border-rose-500 bg-rose-600 text-white'
                : 'border-slate-700 bg-slate-900 text-slate-300 hover:text-sky-300'
            }`}
          >
            {isRecordingClip ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Hindi, Hinglish ya English mein poochein…"
            className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none min-h-[44px]"
          />

          <button
            type="submit"
            disabled={isSending || !draft.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-50 transition-colors min-h-[44px] whitespace-nowrap shrink-0"
          >
            <Send className="w-4 h-4" />
            {isSending ? 'Thinking…' : 'Send'}
          </button>
        </form>
      </section>
    </div>
  );
};
