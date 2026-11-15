import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  Brain,
  CalendarClock,
  Clapperboard,
  Download,
  Lock,
  Mic,
  Smartphone,
  Unlock,
  X,
} from 'lucide-react';
import { AcousticOrb } from './components/AcousticOrb';
import { AgentsPanel } from './components/AgentsPanel';
import { AndroidArchitecturePanel } from './components/AndroidArchitecturePanel';
import { AutomationPanel } from './components/AutomationPanel';
import { MemoryPanel } from './components/MemoryPanel';
import { StudioPanel } from './components/StudioPanel';
import { VoiceConsole } from './components/VoiceConsole';
import { useJarvisVoice } from './hooks/useJarvisVoice';
import { useOnlineStatus, usePWAInstall } from './hooks/usePWAInstall';
import type {
  JarvisSettings,
  JarvisSnapshot,
  MemoryCategory,
  ProviderId,
  StudioArtifact,
} from './types/jarvis';

type TabId = 'voice' | 'agents' | 'memory' | 'automation' | 'studio' | 'android';

const NAV_ITEMS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'voice', label: 'Voice', icon: <Mic className="w-4 h-4" /> },
  { id: 'agents', label: 'Agents', icon: <Bot className="w-4 h-4" /> },
  { id: 'memory', label: 'Memory', icon: <Brain className="w-4 h-4" /> },
  { id: 'automation', label: 'Automation', icon: <CalendarClock className="w-4 h-4" /> },
  { id: 'studio', label: 'Studio', icon: <Clapperboard className="w-4 h-4" /> },
  { id: 'android', label: 'Android APK', icon: <Smartphone className="w-4 h-4" /> },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('voice');
  const [snapshot, setSnapshot] = useState<JarvisSnapshot | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [lockScreenOpen, setLockScreenOpen] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [toastAlert, setToastAlert] = useState<{ title: string; message: string } | null>(null);
  const [clockText, setClockText] = useState(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );

  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const isOnline = useOnlineStatus();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const data = (await res.json()) as JarvisSnapshot;
        setSnapshot(data);
      }
    } catch {
      // Keep cached state if offline
    }
  }, []);

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  useEffect(() => {
    const timer = setInterval(() => {
      setClockText(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
    }, 15_000);
    return () => clearInterval(timer);
  }, []);

  const settings: JarvisSettings = snapshot?.settings ?? {
    defaultLanguage: 'hi',
    wakeWordEnabled: true,
    wakeWordSensitivity: 0.7,
    voiceName: 'Charon',
    voiceTone: 'Calm',
    speechRate: 1.0,
    permissions: {
      microphone: false,
      notifications: false,
      accessibilityBridge: false,
      lockScreenMode: true,
    },
  };

  const handleLiveTranscript = useCallback(
    (role: 'user' | 'jarvis', text: string) => {
      setSnapshot((prev) => {
        if (!prev) return prev;
        const last = prev.messages[prev.messages.length - 1];
        if (last && last.role === role && Date.now() - new Date(last.createdAt).getTime() < 4000) {
          const updated = [...prev.messages];
          updated[updated.length - 1] = {
            ...last,
            text: `${last.text} ${text}`.trim(),
          };
          return { ...prev, messages: updated };
        }
        return {
          ...prev,
          messages: [
            ...prev.messages,
            {
              id: `live_${Date.now()}_${Math.random()}`,
              role,
              text,
              language: prev.settings.defaultLanguage,
              providerUsed: 'gemini-3.8-live',
              createdAt: new Date().toISOString(),
            },
          ],
        };
      });
    },
    []
  );

  const sendMessageRef = useRef<(text: string) => Promise<void>>(async () => {});
  const updateSettingsRef = useRef<(patch: Partial<JarvisSettings>) => Promise<void>>(async () => {});

  const voice = useJarvisVoice({
    language: settings.defaultLanguage,
    wakeWordEnabled: settings.wakeWordEnabled,
    wakeWordSensitivity: settings.wakeWordSensitivity,
    onLiveTranscript: handleLiveTranscript,
    onRefreshState: fetchSnapshot,
    onMicPermissionGranted: () => {
      if (snapshot && !snapshot.settings.permissions.microphone) {
        updateSettingsRef.current({
          permissions: { ...snapshot.settings.permissions, microphone: true },
        });
      }
    },
    onVoiceCommand: (cmd) => {
      if (cmd.type === 'stop') {
        setIsSending(false);
        voice.setOrbState('idle');
      } else if (cmd.type === 'set_lang_hi') {
        updateSettingsRef.current({ defaultLanguage: 'hi' });
        sendMessageRef.current('Ab se Hindi mein jawab do.');
      } else if (cmd.type === 'detail_followup') {
        sendMessageRef.current('Pichhle jawab ko thoda detail mein samjhao.');
      } else if (cmd.type === 'wake_triggered') {
        if (!voice.liveConnected) {
          voice.startLiveSession();
        } else {
          voice.speakBrowserHindiFallback('Ji, boliye. Main sun raha hoon.', settings.speechRate, settings.voiceTone);
        }
      } else if (cmd.type === 'submit_text' && cmd.text) {
        sendMessageRef.current(cmd.text);
      }
    },
  });

  const {
    setOrbState: setVoiceOrbState,
    playWavBase64,
    speakBrowserHindiFallback,
  } = voice;

  const handleSendMessage = useCallback(
    async (text: string, speakReply = true) => {
      setIsSending(true);
      setVoiceOrbState('thinking');
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            language: settings.defaultLanguage,
            includeTts: speakReply,
          }),
        });
        const data = (await res.json()) as {
          snapshot?: JarvisSnapshot;
          wavBase64?: string;
          jarvisMessage?: { text: string };
          error?: string;
        };
        if (!res.ok || data.error) {
          setSnapshot((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              messages: [
                ...prev.messages,
                {
                  id: `err_${Date.now()}`,
                  role: 'jarvis',
                  text: data.error || 'Request failed. Please check API configuration.',
                  language: settings.defaultLanguage,
                  providerUsed: 'error',
                  createdAt: new Date().toISOString(),
                },
              ],
            };
          });
          setVoiceOrbState('idle');
          return;
        }
        if (data.snapshot) {
          setSnapshot((prev) => ({
            ...data.snapshot!,
            environment: prev?.environment,
          }));
        }
        if (data.wavBase64) {
          await playWavBase64(data.wavBase64, settings.speechRate);
        } else if (speakReply && data.jarvisMessage?.text) {
          speakBrowserHindiFallback(data.jarvisMessage.text, settings.speechRate, settings.voiceTone);
        } else {
          setVoiceOrbState('idle');
        }
      } catch {
        setVoiceOrbState('idle');
      } finally {
        setIsSending(false);
      }
    },
    [playWavBase64, setVoiceOrbState, settings.defaultLanguage, settings.speechRate, settings.voiceTone, speakBrowserHindiFallback]
  );

  const handleUpdateSettings = useCallback(async (patch: Partial<JarvisSettings>) => {
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const data = (await res.json()) as { settings: JarvisSettings };
      setSnapshot((prev) => (prev ? { ...prev, settings: data.settings } : prev));
    }
  }, []);

  useEffect(() => {
    sendMessageRef.current = handleSendMessage;
    updateSettingsRef.current = handleUpdateSettings;
  }, [handleSendMessage, handleUpdateSettings]);

  // WebSocket Events Listener for Live Scheduled Reminders
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/events`);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as {
          type?: string;
          title?: string;
          message?: string;
        };
        if (msg.type === 'automation_triggered' && msg.title) {
          setToastAlert({ title: msg.title, message: msg.message || '' });
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification(`JARVIS: ${msg.title}`, { body: msg.message });
          }
          speakBrowserHindiFallback(
            `Reminder: ${msg.message || msg.title}`,
            settings.speechRate,
            settings.voiceTone
          );
          fetchSnapshot();
        } else if (msg.type === 'state_updated') {
          fetchSnapshot();
        }
      } catch {
        // ignore
      }
    };
    return () => ws.close();
  }, [fetchSnapshot, settings.speechRate, settings.voiceTone, speakBrowserHindiFallback]);

  // Lock-Screen Wake Lock Lifecycle
  useEffect(() => {
    const nav = navigator as unknown as {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    if (lockScreenOpen && nav.wakeLock) {
      nav.wakeLock
        .request('screen')
        .then((sentinel) => {
          wakeLockRef.current = sentinel;
        })
        .catch(() => {});
    } else if (!lockScreenOpen && wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  }, [lockScreenOpen]);

  const handleReplayTts = async (text: string) => {
    voice.setOrbState('thinking');
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voiceName: settings.voiceName,
          voiceTone: settings.voiceTone,
        }),
      });
      const data = (await res.json()) as { wavBase64?: string };
      if (data.wavBase64) {
        await voice.playWavBase64(data.wavBase64, settings.speechRate);
      } else {
        voice.speakBrowserHindiFallback(text, settings.speechRate, settings.voiceTone);
      }
    } catch {
      voice.speakBrowserHindiFallback(text, settings.speechRate, settings.voiceTone);
    }
  };

  const handleTranscribeBlob = async (blob: Blob) => {
    voice.setOrbState('thinking');
    const reader = new FileReader();
    reader.onloadend = async () => {
      const result = String(reader.result || '');
      const base64Audio = result.split(',')[1] || '';
      if (!base64Audio) return;
      try {
        const res = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Audio, mimeType: blob.type || 'audio/webm' }),
        });
        const data = (await res.json()) as { transcript?: string };
        if (data.transcript) {
          await handleSendMessage(data.transcript, true);
        } else {
          voice.setOrbState('idle');
        }
      } catch {
        voice.setOrbState('idle');
      }
    };
    reader.readAsDataURL(blob);
  };

  const handleSaveMemory = async (category: MemoryCategory, key: string, value: string) => {
    const res = await fetch('/api/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, key, value }),
    });
    const data = (await res.json()) as { memories?: JarvisSnapshot['memories']; error?: string };
    if (!res.ok) {
      return { ok: false, error: data.error || 'Failed to save memory' };
    }
    if (data.memories) {
      setSnapshot((prev) => (prev ? { ...prev, memories: data.memories! } : prev));
    }
    return { ok: true };
  };

  const handleDeleteMemory = async (id: string) => {
    const res = await fetch(`/api/memory/${id}`, { method: 'DELETE' });
    const data = (await res.json()) as { memories?: JarvisSnapshot['memories'] };
    if (data.memories) {
      setSnapshot((prev) => (prev ? { ...prev, memories: data.memories! } : prev));
    }
  };

  const handleUpdateProvider = async (
    id: ProviderId,
    patch: { enabled?: boolean; model?: string; baseUrl?: string; apiKey?: string }
  ) => {
    const res = await fetch(`/api/providers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = (await res.json()) as { providers?: JarvisSnapshot['providers'] };
    if (data.providers) {
      setSnapshot((prev) => (prev ? { ...prev, providers: data.providers! } : prev));
    }
  };

  const handleCreateAutomation = async (rule: {
    title: string;
    hindiPrompt: string;
    timeOfDay: string;
    recurrence: 'daily' | 'weekdays' | 'once' | 'hourly';
  }) => {
    const res = await fetch('/api/automations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule),
    });
    const data = (await res.json()) as { snapshot?: JarvisSnapshot };
    if (data.snapshot) {
      setSnapshot((prev) => ({ ...data.snapshot!, environment: prev?.environment }));
    }
  };

  const handleToggleAutomation = async (id: string, enabled: boolean) => {
    const res = await fetch(`/api/automations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    const data = (await res.json()) as { snapshot?: JarvisSnapshot };
    if (data.snapshot) {
      setSnapshot((prev) => ({ ...data.snapshot!, environment: prev?.environment }));
    }
  };

  const handleDeleteAutomation = async (id: string) => {
    const res = await fetch(`/api/automations/${id}`, { method: 'DELETE' });
    const data = (await res.json()) as { snapshot?: JarvisSnapshot };
    if (data.snapshot) {
      setSnapshot((prev) => ({ ...data.snapshot!, environment: prev?.environment }));
    }
  };

  const handleRunAutomation = async (id: string) => {
    await fetch(`/api/automations/${id}/run`, { method: 'POST' });
    await fetchSnapshot();
  };

  const handleGenerateStudio = async (params: {
    type: StudioArtifact['type'];
    topic: string;
    language: string;
    includeVoiceover: boolean;
  }) => {
    const res = await fetch('/api/studio/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = (await res.json()) as {
      artifact?: StudioArtifact;
      snapshot?: JarvisSnapshot;
      error?: string;
    };
    if (!res.ok || !data.artifact) {
      throw new Error(data.error || 'Studio generation failed');
    }
    if (data.snapshot) {
      setSnapshot((prev) => ({ ...data.snapshot!, environment: prev?.environment }));
    }
    return data.artifact;
  };

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 pb-20 md:pb-10">
      {/* Top Bar Contract: Zone 1 Brand — Zone 2 Nav Links — Zone 3 Primary Action */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#090D16]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => setActiveTab('voice')}
            className="font-display text-lg font-bold tracking-wider text-slate-50 whitespace-nowrap shrink-0"
          >
            JARVIS
          </button>

          <nav className="hidden md:flex items-center gap-6">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`text-sm font-medium transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                  activeTab === item.id
                    ? 'border-sky-400 text-slate-50'
                    : 'border-transparent text-slate-400 hover:text-slate-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center shrink-0">
            {!isInstalled && isInstallable ? (
              <button
                type="button"
                onClick={install}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-3.5 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400 transition-colors whitespace-nowrap shrink-0 min-h-[36px]"
              >
                <Download className="w-3.5 h-3.5" />
                Install App
              </button>
            ) : !isInstalled && isIOS ? (
              <button
                type="button"
                onClick={() => setShowIosGuide(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 min-h-[36px]"
              >
                Install on iOS
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setLockScreenOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-3.5 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400 transition-colors whitespace-nowrap shrink-0 min-h-[36px]"
              >
                <Lock className="w-3.5 h-3.5" />
                Standby Mode
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
        {activeTab === 'voice' && (
          <VoiceConsole
            messages={snapshot?.messages || []}
            settings={settings}
            orbState={voice.orbState}
            audioLevel={voice.audioLevel}
            liveConnected={voice.liveConnected}
            wakeListenerActive={voice.wakeListenerActive}
            liveError={voice.liveError}
            interimTranscript={voice.interimTranscript}
            isSending={isSending}
            onToggleLive={() =>
              voice.liveConnected ? voice.stopLiveSession() : voice.startLiveSession()
            }
            onToggleWakeListener={() =>
              voice.wakeListenerActive
                ? voice.stopWakeWordListener()
                : voice.startWakeWordListener()
            }
            onStopAll={() => {
              voice.clearAudioPlayback();
              voice.stopLiveSession();
              setIsSending(false);
            }}
            onSendMessage={(text) => handleSendMessage(text, true)}
            onReplayTts={handleReplayTts}
            onClearMessages={async () => {
              await fetch('/api/messages', { method: 'DELETE' });
              fetchSnapshot();
            }}
            onUpdateSettings={handleUpdateSettings}
            onOpenLockScreen={() => setLockScreenOpen(true)}
            onTranscribeBlob={handleTranscribeBlob}
            onAcquireMicStream={voice.acquireSharedMicStream}
            onReleaseVoiceNoteMic={voice.releaseVoiceNoteMic}
          />
        )}

        {activeTab === 'agents' && (
          <AgentsPanel
            agentRuns={snapshot?.agentRuns || []}
            providers={snapshot?.providers || []}
            onDispatchAgent={async (prompt) => {
              await handleSendMessage(prompt, false);
            }}
            onUpdateProvider={handleUpdateProvider}
          />
        )}

        {activeTab === 'memory' && (
          <MemoryPanel
            memories={snapshot?.memories || []}
            onSaveMemory={handleSaveMemory}
            onDeleteMemory={handleDeleteMemory}
          />
        )}

        {activeTab === 'automation' && (
          <AutomationPanel
            automations={snapshot?.automations || []}
            workflowHistory={snapshot?.workflowHistory || []}
            onNaturalLanguageSchedule={async (hindiCommand) => {
              await handleSendMessage(hindiCommand, true);
            }}
            onCreateRule={handleCreateAutomation}
            onToggleRule={handleToggleAutomation}
            onDeleteRule={handleDeleteAutomation}
            onRunNow={handleRunAutomation}
          />
        )}

        {activeTab === 'studio' && (
          <StudioPanel
            artifacts={snapshot?.studioArtifacts || []}
            onGenerate={handleGenerateStudio}
          />
        )}

        {activeTab === 'android' && (
          <AndroidArchitecturePanel
            environment={snapshot?.environment}
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
          />
        )}
      </main>

      {/* Mobile Compact Bottom Tab Bar (<= 15% sticky height cap) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-14 bg-[#090D16]/95 backdrop-blur-md border-t border-slate-800 grid grid-cols-6 items-center">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center justify-center min-h-[44px] ${
              activeTab === item.id ? 'text-sky-400' : 'text-slate-400'
            }`}
          >
            {item.icon}
            <span className="text-[10px] mt-0.5 truncate max-w-[54px]">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Offline Indicator */}
      {!isOnline && (
        <div className="fixed bottom-16 md:bottom-4 left-4 z-40 rounded-lg border border-amber-500/40 bg-amber-950/90 px-3 py-1.5 text-xs text-amber-200">
          Offline Mode — Cached memory active
        </div>
      )}

      {/* Scheduled Automation Notification Banner */}
      {toastAlert && (
        <div className="fixed bottom-16 md:bottom-5 right-4 z-40 max-w-sm rounded-xl border border-sky-500/40 bg-[#0F172A] p-4 shadow-xl flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-sky-400">JARVIS Scheduled Alert</div>
            <div className="mt-0.5 text-sm font-semibold text-slate-100">{toastAlert.title}</div>
            <p className="mt-1 text-xs text-slate-300">{toastAlert.message}</p>
          </div>
          <button
            type="button"
            onClick={() => setToastAlert(null)}
            aria-label="Dismiss alert"
            className="p-1 text-slate-400 hover:text-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* OLED Lock-Screen / Hands-Free Standby Overlay */}
      {lockScreenOpen && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-between p-8 text-center">
          <div className="w-full max-w-md flex items-center justify-between text-xs text-slate-400">
            <span>Lock-Screen Standby Companion</span>
            <button
              type="button"
              onClick={() => setLockScreenOpen(false)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 px-3 py-1.5 text-slate-200 hover:bg-slate-900 min-h-[36px]"
            >
              <Unlock className="w-3.5 h-3.5" />
              Unlock
            </button>
          </div>

          <div className="space-y-4">
            <div className="font-mono text-5xl font-semibold text-slate-100 tabular-nums">
              {clockText}
            </div>
            <p className="text-xs text-slate-400">
              {voice.wakeListenerActive
                ? 'Listening for "Jarvis" or "Hey Jarvis"…'
                : 'Tap the orb to start Gemini Live Hindi voice conversation'}
            </p>
            <div className="py-4">
              <AcousticOrb
                state={voice.orbState}
                audioLevel={voice.audioLevel}
                onClick={() =>
                  voice.liveConnected
                    ? voice.stopLiveSession()
                    : voice.startLiveSession()
                }
              />
            </div>
            {snapshot?.messages[snapshot.messages.length - 1] && (
              <p className="max-w-md mx-auto text-sm text-slate-300 leading-relaxed">
                {snapshot.messages[snapshot.messages.length - 1].text}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                voice.wakeListenerActive
                  ? voice.stopWakeWordListener()
                  : voice.startWakeWordListener()
              }
              className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs font-medium text-slate-200 hover:border-sky-500/40 min-h-[44px]"
            >
              {voice.wakeListenerActive ? 'Pause Wake Word' : 'Start Wake Word ("Jarvis")'}
            </button>
          </div>
        </div>
      )}

      {/* iOS Safari Install Guide Modal */}
      {showIosGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-[#0F172A] p-6">
            <h3 className="font-display text-lg font-semibold text-slate-100">
              Install JARVIS on iPhone / iPad
            </h3>
            <p className="mt-2 text-xs text-slate-300 leading-relaxed">
              1. Tap the <strong>Share</strong> button in Safari toolbar.
              <br />
              2. Scroll down and tap <strong>Add to Home Screen</strong>.
            </p>
            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="mt-4 w-full rounded-xl bg-sky-500 py-2.5 text-xs font-medium text-slate-950"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
