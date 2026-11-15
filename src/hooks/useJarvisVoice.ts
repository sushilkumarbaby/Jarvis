import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceOrbState, VoiceTone } from '../types/jarvis';

function downsampleTo16k(samples: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate === 16000 || inputSampleRate <= 0) return samples;
  const ratio = inputSampleRate / 16000;
  const newLength = Math.max(1, Math.round(samples.length / ratio));
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += samples[j];
      count++;
    }
    result[i] = count > 0 ? sum / count : samples[Math.min(start, samples.length - 1)];
  }
  return result;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function float32ToPcm16Base64(float32: Float32Array): string {
  const buf = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return uint8ToBase64(new Uint8Array(buf));
}

function float32ToWavBase64(float32: Float32Array, sampleRate = 16000): string {
  const dataBytes = float32.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buf);

  const writeAscii = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }

  return uint8ToBase64(new Uint8Array(buf));
}

function base64Pcm16ToFloat32(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const view = new DataView(bytes.buffer);
  const out = new Float32Array(bytes.byteLength / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = view.getInt16(i * 2, true) / 32768;
  }
  return out;
}

export function playWakeChime() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now); // C5
    osc2.frequency.setValueAtTime(783.99, now + 0.08); // G5

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.16);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.34);
    setTimeout(() => ctx.close(), 500);
  } catch {
    // Ignore audio context autoplay restriction
  }
}

interface UseJarvisVoiceOptions {
  language: 'hi' | 'hinglish' | 'en';
  wakeWordEnabled: boolean;
  wakeWordSensitivity?: number;
  onLiveTranscript: (role: 'user' | 'jarvis', text: string) => void;
  onVoiceCommand: (cmd: {
    type: 'submit_text' | 'stop' | 'set_lang_hi' | 'detail_followup' | 'wake_triggered';
    text?: string;
  }) => void;
  onRefreshState: () => void;
  onMicPermissionGranted?: () => void;
}

const PRE_ROLL_MAX_SAMPLES = 16000; // ~1.0s of 16kHz local pre-roll ring buffer
const MAX_WAKE_CLIP_SAMPLES = 16000 * 4.5; // max 4.5s local wake phrase buffer

export function useJarvisVoice({
  language,
  wakeWordEnabled,
  wakeWordSensitivity = 0.7,
  onLiveTranscript,
  onVoiceCommand,
  onRefreshState,
  onMicPermissionGranted,
}: UseJarvisVoiceOptions) {
  const [orbState, setOrbState] = useState<VoiceOrbState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [liveConnected, setLiveConnected] = useState(false);
  const [wakeListenerActive, setWakeListenerActive] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState('');
  const voiceNoteRecordingRef = useRef(false);
  const micPermReportedRef = useRef(false);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const micAcquirePromiseRef = useRef<Promise<void> | null>(null);
  const isLiveConnectingRef = useRef(false);

  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const currentWavAudioRef = useRef<HTMLAudioElement | null>(null);

  const wakeActiveRef = useRef(false);
  const liveConnectedRef = useRef(false);
  const echoTailUntilRef = useRef(0);
  const bargeInStartMsRef = useRef(0);
  const speechHangoverUntilRef = useRef(0);

  // Local wake-word ring buffer & utterance capture (avoids SpeechRecognition mic on/off cycling)
  const preRollChunksRef = useRef<Float32Array[]>([]);
  const preRollCountRef = useRef(0);
  const wakeUtteranceChunksRef = useRef<Float32Array[]>([]);
  const wakeUtteranceCountRef = useRef(0);
  const wakeCapturingRef = useRef(false);
  const wakeSpeechConfirmStartRef = useRef(0);
  const wakeSilenceStartRef = useRef(0);
  const wakeEvaluatingRef = useRef(false);
  const lastAudioUiMsRef = useRef(0);
  const lastAudioUiValRef = useRef(0);

  const languageRef = useRef(language);
  const wakeSensitivityRef = useRef(wakeWordSensitivity);
  const onVoiceCommandRef = useRef(onVoiceCommand);
  const onLiveTranscriptRef = useRef(onLiveTranscript);
  const onRefreshStateRef = useRef(onRefreshState);
  const onMicPermissionGrantedRef = useRef(onMicPermissionGranted);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  useEffect(() => {
    wakeSensitivityRef.current = wakeWordSensitivity;
  }, [wakeWordSensitivity]);

  useEffect(() => {
    onVoiceCommandRef.current = onVoiceCommand;
    onLiveTranscriptRef.current = onLiveTranscript;
    onRefreshStateRef.current = onRefreshState;
    onMicPermissionGrantedRef.current = onMicPermissionGranted;
  }, [onVoiceCommand, onLiveTranscript, onRefreshState, onMicPermissionGranted]);

  const updateAudioLevelThrottled = useCallback((nextVal: number) => {
    const now = Date.now();
    if (
      now - lastAudioUiMsRef.current >= 90 &&
      Math.abs(nextVal - lastAudioUiValRef.current) >= 0.03
    ) {
      lastAudioUiMsRef.current = now;
      lastAudioUiValRef.current = nextVal;
      setAudioLevel(nextVal);
    }
  }, []);

  const clearAudioPlayback = useCallback(() => {
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {
        // Ignore already stopped
      }
    });
    activeSourcesRef.current.clear();
    if (outputCtxRef.current) {
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    }
    if (currentWavAudioRef.current) {
      currentWavAudioRef.current.pause();
      currentWavAudioRef.current.currentTime = 0;
      currentWavAudioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  // Pause mic capture softly (track.enabled = false + suspend AudioContext) WITHOUT stopping the track,
  // so the user never gets prompted for microphone permission again.
  const pauseMicIfIdle = useCallback(() => {
    if (
      liveConnectedRef.current ||
      isLiveConnectingRef.current ||
      wakeActiveRef.current ||
      voiceNoteRecordingRef.current
    ) {
      return;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = false;
      });
    }
    if (inputCtxRef.current && inputCtxRef.current.state === 'running') {
      inputCtxRef.current.suspend().catch(() => {});
    }
    preRollChunksRef.current = [];
    preRollCountRef.current = 0;
    wakeUtteranceChunksRef.current = [];
    wakeUtteranceCountRef.current = 0;
    wakeCapturingRef.current = false;
    setAudioLevel(0);
  }, []);

  const disposeMicCompletely = useCallback(() => {
    if (processorRef.current) {
      try {
        processorRef.current.onaudioprocess = null;
        processorRef.current.disconnect();
      } catch {
        // ignore
      }
      processorRef.current = null;
    }
    if (silentGainRef.current) {
      try {
        silentGainRef.current.disconnect();
      } catch {
        // ignore
      }
      silentGainRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (inputCtxRef.current) {
      inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }
  }, []);

  const evaluateCapturedWakeClip = useCallback(async (samples: Float32Array) => {
    if (wakeEvaluatingRef.current || liveConnectedRef.current) return;
    wakeEvaluatingRef.current = true;
    setInterimTranscript('Checking voice command…');
    try {
      const wavBase64 = float32ToWavBase64(samples, 16000);
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Audio: wavBase64, mimeType: 'audio/wav' }),
      });
      if (!res.ok) {
        setInterimTranscript('');
        return;
      }
      const data = (await res.json()) as { transcript?: string };
      const rawText = (data.transcript || '').trim();
      setInterimTranscript('');
      if (!rawText) return;

      const lower = rawText.toLowerCase();
      if (
        lower.includes('ruk jao') ||
        lower.includes('रुक जाओ') ||
        lower.includes('cancel karo') ||
        lower.includes('कैंसल करो') ||
        lower.includes('stop jarvis')
      ) {
        clearAudioPlayback();
        onVoiceCommandRef.current({ type: 'stop' });
        return;
      }

      if (lower.includes('hindi mein jawab do') || lower.includes('हिंदी में जवाब दो')) {
        onVoiceCommandRef.current({ type: 'set_lang_hi' });
        return;
      }

      if (lower.includes('thoda detail mein samjhao') || lower.includes('डिटेल में समझाओ')) {
        onVoiceCommandRef.current({ type: 'detail_followup' });
        return;
      }

      const wakeRx = /\b(hey\s+)?(jarvis|jarvish|jarves)\b|जार्विस|जर्विस|जरविस|जार्वेस/i;
      if (wakeRx.test(rawText)) {
        playWakeChime();
        const stripped = rawText
          .replace(/\b(hey\s+)?(jarvis|jarvish|jarves)\b[,:\s]*/gi, '')
          .replace(/(जार्विस|जर्विस|जरविस|जार्वेस)[,:\s]*/g, '')
          .trim();

        if (!stripped || /^(suno|सुनो|ji|haan)[.!?]*$/i.test(stripped)) {
          onVoiceCommandRef.current({ type: 'wake_triggered' });
        } else {
          onVoiceCommandRef.current({ type: 'submit_text', text: stripped });
        }
      }
    } catch {
      setInterimTranscript('');
    } finally {
      wakeEvaluatingRef.current = false;
    }
  }, [clearAudioPlayback]);

  // Single steady mic capture shared seamlessly across Wake Word, Live Voice & Voice Notes (never turns off/on)
  const ensureMicCapture = useCallback(async (): Promise<MediaStream> => {
    const existingTrack = micStreamRef.current?.getAudioTracks()[0];
    if (
      micStreamRef.current &&
      existingTrack &&
      existingTrack.readyState === 'live' &&
      inputCtxRef.current &&
      processorRef.current
    ) {
      existingTrack.enabled = true;
      if (inputCtxRef.current.state === 'suspended') {
        await inputCtxRef.current.resume().catch(() => {});
      }
      return micStreamRef.current;
    }

    if (micAcquirePromiseRef.current) {
      await micAcquirePromiseRef.current;
      if (micStreamRef.current) return micStreamRef.current;
    }

    micAcquirePromiseRef.current = (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        });
        micStreamRef.current = stream;
        if (!micPermReportedRef.current) {
          micPermReportedRef.current = true;
          onMicPermissionGrantedRef.current?.();
        }

        const inputCtx = new AudioContext({ sampleRate: 16000 });
        if (inputCtx.state === 'suspended') {
          await inputCtx.resume().catch(() => {});
        }
        inputCtxRef.current = inputCtx;

        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        const silentGain = inputCtx.createGain();
        silentGain.gain.value = 0;
        processorRef.current = processor;
        silentGainRef.current = silentGain;

        processor.onaudioprocess = (e) => {
          const out = e.outputBuffer.getChannelData(0);
          out.fill(0);

          const rawSamples = e.inputBuffer.getChannelData(0);
          const samples = downsampleTo16k(rawSamples, inputCtx.sampleRate);

          let sum = 0;
          for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
          const rms = Math.sqrt(sum / samples.length);

          const now = Date.now();
          const isModelSpeakingOrTail =
            activeSourcesRef.current.size > 0 ||
            currentWavAudioRef.current !== null ||
            now < echoTailUntilRef.current;

          if (!isModelSpeakingOrTail) {
            updateAudioLevelThrottled(Math.min(1, rms * 6));
          }

          // Mode 1: Active Gemini Live WebSocket session
          const ws = wsRef.current;
          if (ws && ws.readyState === WebSocket.OPEN && liveConnectedRef.current) {
            let frameToSend: Float32Array;
            if (isModelSpeakingOrTail) {
              // Echo-suppression gate: require >= 360ms of deliberate voice (>= 0.06 RMS) to barge in
              if (rms >= 0.06) {
                if (bargeInStartMsRef.current === 0) bargeInStartMsRef.current = now;
              } else {
                bargeInStartMsRef.current = 0;
              }
              const sustainedBargeIn =
                bargeInStartMsRef.current > 0 && now - bargeInStartMsRef.current >= 360;
              frameToSend = sustainedBargeIn ? samples : new Float32Array(samples.length);
            } else {
              bargeInStartMsRef.current = 0;
              // Ambient noise floor gate with 650ms hangover so Hindi pauses aren't clipped
              if (rms >= 0.008) {
                speechHangoverUntilRef.current = now + 650;
                frameToSend = samples;
              } else if (now < speechHangoverUntilRef.current) {
                frameToSend = samples;
              } else {
                frameToSend = new Float32Array(samples.length);
              }
            }
            ws.send(JSON.stringify({ audio: float32ToPcm16Base64(frameToSend) }));
            return;
          }

          // Mode 2: Local Wake-Word Standby (strictly local ring buffer; zero network while silent)
          if (wakeActiveRef.current && !isLiveConnectingRef.current) {
            if (isModelSpeakingOrTail || wakeEvaluatingRef.current) {
              wakeCapturingRef.current = false;
              wakeSpeechConfirmStartRef.current = 0;
              wakeUtteranceChunksRef.current = [];
              wakeUtteranceCountRef.current = 0;
              return;
            }

            // Sensitivity 0.2 -> threshold 0.048 | Sensitivity 1.0 -> threshold 0.014
            const sens = Math.min(1, Math.max(0.2, wakeSensitivityRef.current));
            const wakeThreshold = 0.056 - sens * 0.042;
            const frameCopy = new Float32Array(samples);

            if (!wakeCapturingRef.current) {
              preRollChunksRef.current.push(frameCopy);
              preRollCountRef.current += frameCopy.length;
              while (preRollCountRef.current > PRE_ROLL_MAX_SAMPLES && preRollChunksRef.current.length > 1) {
                const dropped = preRollChunksRef.current.shift()!;
                preRollCountRef.current -= dropped.length;
              }

              if (rms >= wakeThreshold) {
                if (wakeSpeechConfirmStartRef.current === 0) {
                  wakeSpeechConfirmStartRef.current = now;
                } else if (now - wakeSpeechConfirmStartRef.current >= 180) {
                  wakeCapturingRef.current = true;
                  wakeSilenceStartRef.current = 0;
                  wakeUtteranceChunksRef.current = [...preRollChunksRef.current];
                  wakeUtteranceCountRef.current = preRollCountRef.current;
                  preRollChunksRef.current = [];
                  preRollCountRef.current = 0;
                }
              } else {
                wakeSpeechConfirmStartRef.current = 0;
              }
            } else {
              wakeUtteranceChunksRef.current.push(frameCopy);
              wakeUtteranceCountRef.current += frameCopy.length;

              if (rms >= wakeThreshold * 0.65) {
                wakeSilenceStartRef.current = 0;
              } else if (wakeSilenceStartRef.current === 0) {
                wakeSilenceStartRef.current = now;
              }

              const silenceElapsed =
                wakeSilenceStartRef.current > 0 ? now - wakeSilenceStartRef.current : 0;
              if (silenceElapsed >= 650 || wakeUtteranceCountRef.current >= MAX_WAKE_CLIP_SAMPLES) {
                const totalLen = wakeUtteranceCountRef.current;
                const combined = new Float32Array(totalLen);
                let offset = 0;
                for (const c of wakeUtteranceChunksRef.current) {
                  combined.set(c, offset);
                  offset += c.length;
                }
                wakeCapturingRef.current = false;
                wakeSpeechConfirmStartRef.current = 0;
                wakeSilenceStartRef.current = 0;
                wakeUtteranceChunksRef.current = [];
                wakeUtteranceCountRef.current = 0;
                evaluateCapturedWakeClip(combined);
              }
            }
          }
        };

        source.connect(processor);
        processor.connect(silentGain);
        silentGain.connect(inputCtx.destination);
      } finally {
        micAcquirePromiseRef.current = null;
      }
    })();

    await micAcquirePromiseRef.current;
    if (!micStreamRef.current) {
      throw new Error('Microphone stream unavailable.');
    }
    return micStreamRef.current;
  }, [evaluateCapturedWakeClip, updateAudioLevelThrottled]);

  const acquireSharedMicStream = useCallback(async (): Promise<MediaStream> => {
    voiceNoteRecordingRef.current = true;
    try {
      return await ensureMicCapture();
    } catch (err) {
      voiceNoteRecordingRef.current = false;
      throw err;
    }
  }, [ensureMicCapture]);

  const releaseVoiceNoteMic = useCallback(() => {
    voiceNoteRecordingRef.current = false;
    pauseMicIfIdle();
  }, [pauseMicIfIdle]);

  const stopLiveSession = useCallback(() => {
    isLiveConnectingRef.current = false;
    liveConnectedRef.current = false;
    setLiveConnected(false);
    clearAudioPlayback();

    if (wsRef.current) {
      const socket = wsRef.current;
      wsRef.current = null;
      try {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
      } catch {
        // ignore
      }
    }
    bargeInStartMsRef.current = 0;
    speechHangoverUntilRef.current = 0;
    setOrbState('idle');
    pauseMicIfIdle();
  }, [clearAudioPlayback, pauseMicIfIdle]);

  const playWavBase64 = useCallback(
    async (wavBase64: string, speechRate = 1.0) => {
      clearAudioPlayback();
      return new Promise<void>((resolve) => {
        const audio = new Audio(`data:audio/wav;base64,${wavBase64}`);
        audio.playbackRate = speechRate;
        currentWavAudioRef.current = audio;
        setOrbState('speaking');
        setAudioLevel(0.62);

        const finish = (nextState: VoiceOrbState) => {
          currentWavAudioRef.current = null;
          echoTailUntilRef.current = Date.now() + 420;
          setAudioLevel(0);
          setOrbState(nextState);
          resolve();
        };

        audio.onended = () => finish(liveConnectedRef.current ? 'listening' : 'idle');
        audio.onerror = () => finish('idle');
        audio.play().catch(() => finish('idle'));
      });
    },
    [clearAudioPlayback]
  );

  const speakBrowserHindiFallback = useCallback((text: string, rate = 1.0, tone: VoiceTone = 'Calm') => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'hi-IN';
    const toneRateOffset =
      tone === 'Enthusiastic' ? 1.07 : tone === 'Calm' ? 0.96 : tone === 'Empathetic' ? 0.94 : 1.0;
    const tonePitch =
      tone === 'Enthusiastic' ? 0.98 : tone === 'Formal' ? 0.86 : tone === 'Empathetic' ? 0.92 : 0.9;
    utter.rate = Math.min(1.4, Math.max(0.75, rate * toneRateOffset));
    utter.pitch = tonePitch;
    const voices = window.speechSynthesis.getVoices();
    const preferredMale = voices.find(
      (v) =>
        (v.lang.startsWith('hi') || v.lang.startsWith('en-IN')) &&
        /male|hemant|madhur|rishi|prabhat|google हिन्दी/i.test(v.name)
    );
    if (preferredMale) utter.voice = preferredMale;
    setOrbState('speaking');
    setAudioLevel(0.45);
    utter.onend = () => {
      echoTailUntilRef.current = Date.now() + 420;
      setAudioLevel(0);
      setOrbState(liveConnectedRef.current ? 'listening' : 'idle');
    };
    window.speechSynthesis.speak(utter);
  }, []);

  const schedulePcmChunk = useCallback((b64: string) => {
    if (!outputCtxRef.current) {
      outputCtxRef.current = new AudioContext({ sampleRate: 24000 });
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    }
    const ctx = outputCtxRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const float32 = base64Pcm16ToFloat32(b64);
    const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);

    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime + 0.02, nextStartTimeRef.current);
    src.start(startAt);
    nextStartTimeRef.current = startAt + audioBuffer.duration;
    activeSourcesRef.current.add(src);
    bargeInStartMsRef.current = 0;
    setOrbState('speaking');
    setAudioLevel(0.68);

    src.onended = () => {
      activeSourcesRef.current.delete(src);
      if (activeSourcesRef.current.size === 0) {
        echoTailUntilRef.current = Date.now() + 420;
        if (liveConnectedRef.current) {
          setOrbState('listening');
          setAudioLevel(0.12);
        }
      }
    };
  }, []);

  const startLiveSession = useCallback(async () => {
    setLiveError(null);
    if (liveConnectedRef.current || isLiveConnectingRef.current) return;
    isLiveConnectingRef.current = true;

    try {
      await ensureMicCapture();
      if (!outputCtxRef.current) {
        outputCtxRef.current = new AudioContext({ sampleRate: 24000 });
        nextStartTimeRef.current = outputCtxRef.current.currentTime;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/live?lang=${languageRef.current}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as {
            ready?: boolean;
            closed?: boolean;
            audio?: string;
            interrupted?: boolean;
            turnComplete?: boolean;
            inputTranscript?: string;
            outputTranscript?: string;
            toolEvent?: { agent: string; note: string };
            error?: string;
          };
          if (msg.ready) {
            isLiveConnectingRef.current = false;
            liveConnectedRef.current = true;
            setLiveConnected(true);
            setOrbState('listening');
          }
          if (msg.audio) {
            schedulePcmChunk(msg.audio);
          }
          if (msg.interrupted) {
            clearAudioPlayback();
            echoTailUntilRef.current = 0;
            bargeInStartMsRef.current = 0;
            setOrbState('listening');
          }
          if (msg.inputTranscript) {
            onLiveTranscriptRef.current('user', msg.inputTranscript);
          }
          if (msg.outputTranscript) {
            onLiveTranscriptRef.current('jarvis', msg.outputTranscript);
          }
          if (msg.toolEvent) {
            setOrbState('executing');
            onRefreshStateRef.current();
          }
          if (msg.turnComplete && activeSourcesRef.current.size === 0) {
            setOrbState('listening');
          }
          if (msg.closed) {
            stopLiveSession();
          }
          if (msg.error) {
            setLiveError(msg.error);
            stopLiveSession();
          }
        } catch {
          // ignore malformed payload
        }
      };

      ws.onerror = () => {
        setLiveError('Live WebSocket connection interrupted.');
        stopLiveSession();
      };

      ws.onclose = () => {
        if (liveConnectedRef.current || isLiveConnectingRef.current) {
          stopLiveSession();
        }
      };
    } catch (err) {
      setLiveError(
        err instanceof Error
          ? err.message
          : 'Microphone access denied. Please allow microphone permission.'
      );
      stopLiveSession();
    }
  }, [clearAudioPlayback, ensureMicCapture, schedulePcmChunk, stopLiveSession]);

  const stopWakeWordListener = useCallback(() => {
    wakeActiveRef.current = false;
    setWakeListenerActive(false);
    setInterimTranscript('');
    wakeCapturingRef.current = false;
    wakeSpeechConfirmStartRef.current = 0;
    wakeUtteranceChunksRef.current = [];
    wakeUtteranceCountRef.current = 0;
    pauseMicIfIdle();
  }, [pauseMicIfIdle]);

  const startWakeWordListener = useCallback(async () => {
    if (wakeActiveRef.current) return;
    setLiveError(null);
    wakeActiveRef.current = true;
    setWakeListenerActive(true);
    try {
      await ensureMicCapture();
    } catch (err) {
      wakeActiveRef.current = false;
      setWakeListenerActive(false);
      setLiveError(
        err instanceof Error
          ? err.message
          : 'Microphone permission denied for wake-word listener.'
      );
      pauseMicIfIdle();
    }
  }, [ensureMicCapture, pauseMicIfIdle]);

  // Auto-arm steady mic once if browser microphone permission is already granted (zero repeated prompts)
  useEffect(() => {
    let cancelled = false;
    const navPerms = (navigator as unknown as {
      permissions?: { query: (d: { name: PermissionName }) => Promise<{ state: PermissionState }> };
    }).permissions;
    if (!navPerms?.query) return;

    navPerms
      .query({ name: 'microphone' as PermissionName })
      .then((status) => {
        if (cancelled) return;
        if (status.state === 'granted') {
          if (!micPermReportedRef.current) {
            micPermReportedRef.current = true;
            onMicPermissionGrantedRef.current?.();
          }
          if (wakeWordEnabled && !wakeActiveRef.current) {
            startWakeWordListener();
          }
        }
      })
      .catch(() => {});

    const resumeAudioOnGesture = () => {
      if (inputCtxRef.current?.state === 'suspended' && (wakeActiveRef.current || liveConnectedRef.current)) {
        inputCtxRef.current.resume().catch(() => {});
      }
      if (outputCtxRef.current?.state === 'suspended') {
        outputCtxRef.current.resume().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', resumeAudioOnGesture, { passive: true });
    window.addEventListener('keydown', resumeAudioOnGesture, { passive: true });

    return () => {
      cancelled = true;
      window.removeEventListener('pointerdown', resumeAudioOnGesture);
      window.removeEventListener('keydown', resumeAudioOnGesture);
    };
  }, [startWakeWordListener, wakeWordEnabled]);

  useEffect(() => {
    if (!wakeWordEnabled && wakeActiveRef.current) {
      stopWakeWordListener();
    }
  }, [wakeWordEnabled, stopWakeWordListener]);

  useEffect(() => {
    return () => {
      wakeActiveRef.current = false;
      voiceNoteRecordingRef.current = false;
      stopLiveSession();
      disposeMicCompletely();
    };
  }, [disposeMicCompletely, stopLiveSession]);

  return {
    orbState,
    setOrbState,
    audioLevel,
    liveConnected,
    wakeListenerActive,
    liveError,
    interimTranscript,
    startLiveSession,
    stopLiveSession,
    startWakeWordListener,
    stopWakeWordListener,
    acquireSharedMicStream,
    releaseVoiceNoteMic,
    playWavBase64,
    speakBrowserHindiFallback,
    clearAudioPlayback,
  };
}
