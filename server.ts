import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
type ArchiverInstance = {
  on: (event: string, cb: (err: Error) => void) => void;
  pipe: (dest: express.Response) => void;
  directory: (dirpath: string, destpath: string) => void;
  finalize: () => Promise<void>;
};
import { WebSocketServer, type WebSocket } from 'ws';
import {
  ActivityHandling,
  EndSensitivity,
  type LiveServerMessage,
  Modality,
  StartSensitivity,
} from '@google/genai';
import {
  ai,
  buildJarvisSystemInstruction,
  executeJarvisTool,
  generateStudioDeliverable,
  jarvisToolDeclarations,
  runJarvisBrain,
  synthesizeHindiSpeech,
  transcribeAudioClip,
} from './server/gemini.ts';
import { jarvisStore } from './server/store.ts';
import type { MemoryCategory, ProviderId, StudioArtifact, VoiceTone } from './server/types.ts';

const PORT = 3000;
const ANDROID_DIR = path.resolve(process.cwd(), 'android-app');

function inspectRuntimeEnvironment() {
  const hasCommand = (cmd: string) => {
    try {
      execSync(`which ${cmd}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  };
  return {
    os: `${process.platform} ${process.arch}`,
    nodeVersion: process.version,
    hasJava: hasCommand('java'),
    hasGradle: hasCommand('gradle'),
    hasAndroidSdk: hasCommand('sdkmanager') || Boolean(process.env.ANDROID_HOME),
    hasAdb: hasCommand('adb'),
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
  };
}

function collectAndroidFiles(dir: string, baseDir: string): { path: string; size: number; content: string }[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results: { path: string; size: number; content: string }[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectAndroidFiles(full, baseDir));
    } else {
      const rel = path.relative(baseDir, full);
      const content = fs.readFileSync(full, 'utf8');
      results.push({ path: rel, size: Buffer.byteLength(content, 'utf8'), content });
    }
  }
  return results.sort((a, b) => a.path.localeCompare(b.path));
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  const server = http.createServer(app);
  const liveWss = new WebSocketServer({ noServer: true });
  const eventsWss = new WebSocketServer({ noServer: true });
  const eventClients = new Set<WebSocket>();

  eventsWss.on('connection', (ws) => {
    eventClients.add(ws);
    ws.on('close', () => eventClients.delete(ws));
  });

  function broadcastEvent(payload: Record<string, unknown>) {
    const raw = JSON.stringify(payload);
    for (const client of eventClients) {
      if (client.readyState === 1) {
        client.send(raw);
      }
    }
  }

  // Gemini Live API WebSocket Bridge (/ws/live)
  liveWss.on('connection', async (clientWs, req) => {
    const reqUrl = new URL(req.url || '/ws/live', `http://${req.headers.host || 'localhost'}`);
    const langParam = (reqUrl.searchParams.get('lang') || 'hi') as 'hi' | 'hinglish' | 'en';
    const settings = jarvisStore.getSettings();

    if (!process.env.GEMINI_API_KEY) {
      clientWs.send(
        JSON.stringify({
          error: 'GEMINI_API_KEY is not configured in server environment.',
        })
      );
      clientWs.close();
      return;
    }

    let liveSession: Awaited<ReturnType<typeof ai.live.connect>> | null = null;
    let sessionActive = false;

    const pingTimer = setInterval(() => {
      if (clientWs.readyState === 1) {
        try {
          clientWs.ping();
        } catch {
          // ignore ping error
        }
      }
    }, 20_000);

    try {
      liveSession = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: settings.voiceName || 'Charon',
              },
            },
          },
          realtimeInputConfig: {
            automaticActivityDetection: {
              startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
              endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
              prefixPaddingMs: 220,
              silenceDurationMs: 850,
            },
            activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
          },
          tools: [{ functionDeclarations: jarvisToolDeclarations }],
          systemInstruction: buildJarvisSystemInstruction(langParam, settings.voiceTone || 'Calm'),
        },
        callbacks: {
          onopen: () => {
            sessionActive = true;
            if (clientWs.readyState === 1) {
              clientWs.send(JSON.stringify({ ready: true }));
            }
          },
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== 1) return;

            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              clientWs.send(
                JSON.stringify({ inputTranscript: content.inputTranscription.text })
              );
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(
                JSON.stringify({ outputTranscript: content.outputTranscription.text })
              );
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
            if (content?.turnComplete) {
              clientWs.send(JSON.stringify({ turnComplete: true }));
            }

            const toolCalls = message.toolCall?.functionCalls ?? [];
            if (toolCalls.length > 0 && liveSession && sessionActive) {
              const responses = toolCalls.map((call) => {
                const executed = executeJarvisTool(
                  call.name || 'delegate_specialist_agent',
                  (call.args as Record<string, unknown>) || {},
                  'gemini-3.8-live'
                );
                clientWs.send(
                  JSON.stringify({
                    toolEvent: {
                      agent: executed.agentUsed,
                      note: executed.actionNote,
                    },
                  })
                );
                broadcastEvent({ type: 'state_updated' });
                return {
                  id: call.id,
                  name: call.name,
                  response: executed.result,
                };
              });
              try {
                liveSession.sendToolResponse({ functionResponses: responses });
              } catch {
                // Ignore if session closed mid-tool-response
              }
            }
          },
          onerror: (err) => {
            sessionActive = false;
            if (clientWs.readyState === 1) {
              clientWs.send(
                JSON.stringify({
                  error: err instanceof Error ? err.message : 'Live session error',
                })
              );
            }
          },
          onclose: (ev) => {
            sessionActive = false;
            if (clientWs.readyState === 1) {
              clientWs.send(JSON.stringify({ closed: true, reason: ev?.reason || '' }));
            }
          },
        },
      });
    } catch (err) {
      clearInterval(pingTimer);
      clientWs.send(
        JSON.stringify({
          error: err instanceof Error ? err.message : 'Failed to connect to Gemini Live API',
        })
      );
      clientWs.close();
      return;
    }

    clientWs.on('message', (raw) => {
      if (!liveSession || !sessionActive) return;
      try {
        const data = JSON.parse(raw.toString()) as {
          audio?: string;
          text?: string;
        };
        if (data.audio) {
          liveSession.sendRealtimeInput({
            audio: { data: data.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (data.text) {
          liveSession.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: data.text }] }],
            turnComplete: true,
          });
        }
      } catch {
        // Ignore malformed frame or closed session
      }
    });

    clientWs.on('close', () => {
      sessionActive = false;
      clearInterval(pingTimer);
      try {
        liveSession?.close();
      } catch {
        // Ignore close error
      }
    });
  });

  // Route WebSocket upgrades cleanly so Vite HMR is preserved
  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname;
    if (pathname === '/ws/live') {
      liveWss.handleUpgrade(request, socket, head, (ws) => {
        liveWss.emit('connection', ws, request);
      });
    } else if (pathname === '/ws/events') {
      eventsWss.handleUpgrade(request, socket, head, (ws) => {
        eventsWss.emit('connection', ws, request);
      });
    }
  });

  // REST API Endpoints
  app.get('/api/state', (_req, res) => {
    res.json({
      ...jarvisStore.getSnapshot(),
      environment: inspectRuntimeEnvironment(),
    });
  });

  app.post('/api/chat', async (req, res) => {
    try {
      const { text, language, includeTts } = req.body as {
        text?: string;
        language?: 'hi' | 'hinglish' | 'en';
        includeTts?: boolean;
      };
      const cleanText = (text || '').trim();
      if (!cleanText) {
        return res.status(400).json({ error: 'Message text is required.' });
      }

      const activeLang = language || jarvisStore.getSettings().defaultLanguage;
      const userMsg = {
        id: `msg_${Date.now()}_u`,
        role: 'user' as const,
        text: cleanText,
        language: activeLang,
        createdAt: new Date().toISOString(),
      };
      jarvisStore.addMessage(userMsg);

      const brainRes = await runJarvisBrain(cleanText, activeLang);

      const jarvisMsg = {
        id: `msg_${Date.now()}_j`,
        role: 'jarvis' as const,
        text: brainRes.text,
        language: activeLang,
        agentUsed: brainRes.agentUsed,
        providerUsed: brainRes.providerUsed,
        groundingUrls: brainRes.groundingUrls,
        actionResult: brainRes.actionResult,
        createdAt: new Date().toISOString(),
      };
      jarvisStore.addMessage(jarvisMsg);

      let wavBase64: string | undefined;
      if (includeTts) {
        try {
          const currentSettings = jarvisStore.getSettings();
          wavBase64 = await synthesizeHindiSpeech(
            brainRes.text,
            currentSettings.voiceName,
            currentSettings.voiceTone
          );
        } catch {
          wavBase64 = undefined;
        }
      }

      broadcastEvent({ type: 'state_updated' });
      return res.json({
        userMessage: userMsg,
        jarvisMessage: jarvisMsg,
        wavBase64,
        snapshot: jarvisStore.getSnapshot(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Chat processing error';
      return res.status(500).json({ error: msg });
    }
  });

  app.post('/api/tts', async (req, res) => {
    try {
      const { text, voiceName, voiceTone } = req.body as {
        text?: string;
        voiceName?: 'Zephyr' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir';
        voiceTone?: VoiceTone;
      };
      if (!text?.trim()) return res.status(400).json({ error: 'Text is required.' });
      const currentSettings = jarvisStore.getSettings();
      const wavBase64 = await synthesizeHindiSpeech(
        text.trim(),
        voiceName || currentSettings.voiceName,
        voiceTone || currentSettings.voiceTone
      );
      return res.json({ wavBase64 });
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'TTS failed',
      });
    }
  });

  app.post('/api/transcribe', async (req, res) => {
    try {
      const { base64Audio, mimeType } = req.body as {
        base64Audio?: string;
        mimeType?: string;
      };
      if (!base64Audio) return res.status(400).json({ error: 'Audio data required.' });
      const transcript = await transcribeAudioClip(base64Audio, mimeType || 'audio/webm');
      return res.json({ transcript });
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Transcription failed',
      });
    }
  });

  app.post('/api/memory', (req, res) => {
    const { category, key, value } = req.body as {
      category?: MemoryCategory;
      key?: string;
      value?: string;
    };
    if (!key?.trim() || !value?.trim()) {
      return res.status(400).json({ error: 'Key and value are required.' });
    }
    const result = jarvisStore.upsertMemory(category || 'preference', key, value);
    if (!result.ok) {
      return res.status(403).json({ error: result.error });
    }
    return res.json({ item: result.item, memories: jarvisStore.getMemories() });
  });

  app.delete('/api/memory/:id', (req, res) => {
    jarvisStore.deleteMemory(req.params.id);
    return res.json({ memories: jarvisStore.getMemories() });
  });

  app.delete('/api/messages', (_req, res) => {
    jarvisStore.clearMessages();
    return res.json({ messages: jarvisStore.getMessages() });
  });

  app.post('/api/automations', (req, res) => {
    const { title, hindiPrompt, timeOfDay, recurrence } = req.body as {
      title?: string;
      hindiPrompt?: string;
      timeOfDay?: string;
      recurrence?: 'daily' | 'weekdays' | 'once' | 'hourly';
    };
    if (!title?.trim()) return res.status(400).json({ error: 'Title required.' });
    const rec = recurrence || 'daily';
    const time = timeOfDay || '07:00';
    const rule = jarvisStore.addAutomation({
      title: title.trim(),
      hindiPrompt: (hindiPrompt || title).trim(),
      cronLabel: `${rec === 'daily' ? 'Daily' : rec === 'weekdays' ? 'Weekdays' : rec === 'hourly' ? 'Hourly' : 'Once'} at ${time}`,
      timeOfDay: time,
      recurrence: rec,
      enabled: true,
      maxRetries: 3,
    });
    return res.json({ rule, snapshot: jarvisStore.getSnapshot() });
  });

  app.patch('/api/automations/:id', (req, res) => {
    const { enabled } = req.body as { enabled?: boolean };
    jarvisStore.toggleAutomation(req.params.id, Boolean(enabled));
    return res.json({ snapshot: jarvisStore.getSnapshot() });
  });

  app.delete('/api/automations/:id', (req, res) => {
    jarvisStore.deleteAutomation(req.params.id);
    return res.json({ snapshot: jarvisStore.getSnapshot() });
  });

  app.post('/api/automations/:id/run', (req, res) => {
    const rule = jarvisStore.getAutomations().find((a) => a.id === req.params.id);
    if (!rule) return res.status(404).json({ error: 'Automation not found.' });
    const entry = jarvisStore.recordAutomationRun(
      rule.id,
      `Reminder active: ${rule.hindiPrompt}`,
      'completed'
    );
    broadcastEvent({
      type: 'automation_triggered',
      title: rule.title,
      message: rule.hindiPrompt,
    });
    return res.json({ entry, snapshot: jarvisStore.getSnapshot() });
  });

  app.patch('/api/providers/:id', (req, res) => {
    const id = req.params.id as ProviderId;
    const { enabled, model, baseUrl, priority, apiKey } = req.body as {
      enabled?: boolean;
      model?: string;
      baseUrl?: string;
      priority?: number;
      apiKey?: string;
    };
    const providers = jarvisStore.updateProvider(id, {
      enabled,
      model,
      baseUrl,
      priority,
      apiKey,
    });
    return res.json({ providers });
  });

  app.patch('/api/settings', (req, res) => {
    const settings = jarvisStore.updateSettings(req.body);
    return res.json({ settings });
  });

  app.post('/api/studio/generate', async (req, res) => {
    try {
      const { type, topic, language, includeVoiceover } = req.body as {
        type?: StudioArtifact['type'];
        topic?: string;
        language?: string;
        includeVoiceover?: boolean;
      };
      if (!topic?.trim()) return res.status(400).json({ error: 'Topic is required.' });
      const currentSettings = jarvisStore.getSettings();
      const artifact = await generateStudioDeliverable({
        type: type || 'youtube_video',
        topic: topic.trim(),
        language: language || 'Hindi / Hinglish',
        includeVoiceover: includeVoiceover !== false,
        voiceName: currentSettings.voiceName,
        voiceTone: currentSettings.voiceTone,
      });
      return res.json({
        artifact: {
          ...artifact,
          hasVoiceover: Boolean(artifact.voiceoverBase64Wav),
          voiceoverBase64Wav: undefined,
        },
        snapshot: jarvisStore.getSnapshot(),
      });
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Creation Studio failed',
      });
    }
  });

  app.get('/api/studio/:id/audio.wav', (req, res) => {
    const artifact = jarvisStore.getStudioArtifactById(req.params.id);
    if (!artifact?.voiceoverBase64Wav) {
      return res.status(404).send('Voiceover not available');
    }
    const buf = Buffer.from(artifact.voiceoverBase64Wav, 'base64');
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Disposition', `attachment; filename="${artifact.id}.wav"`);
    return res.send(buf);
  });

  app.get('/api/android/files', (_req, res) => {
    const files = collectAndroidFiles(ANDROID_DIR, ANDROID_DIR);
    return res.json({ files });
  });

  app.get('/api/android/download', async (_req, res) => {
    if (!fs.existsSync(ANDROID_DIR)) {
      return res.status(404).json({ error: 'Android project directory missing.' });
    }
    try {
      const archiverMod = (await import('archiver')) as unknown as {
        ZipArchive: new (options?: { zlib?: { level?: number } }) => ArchiverInstance;
      };
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="jarvis-android-kotlin.zip"');
      const archive = new archiverMod.ZipArchive({ zlib: { level: 9 } });
      archive.on('error', (err: Error) => {
        if (!res.headersSent) res.status(500).json({ error: err.message });
      });
      archive.pipe(res);
      archive.directory(ANDROID_DIR, 'jarvis-android-kotlin');
      await archive.finalize();
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'ZIP export failed' });
      }
    }
  });

  // Real Background Automation Scheduler Tick (runs every 30s)
  let lastCheckedMinute = '';
  setInterval(() => {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (hhmm === lastCheckedMinute) return;
    lastCheckedMinute = hhmm;

    for (const rule of jarvisStore.getAutomations()) {
      if (!rule.enabled) continue;
      const isWeekday = now.getDay() >= 1 && now.getDay() <= 5;
      const matches =
        (rule.recurrence === 'daily' && rule.timeOfDay === hhmm) ||
        (rule.recurrence === 'weekdays' && isWeekday && rule.timeOfDay === hhmm) ||
        (rule.recurrence === 'hourly' && hhmm.endsWith(':00')) ||
        (rule.recurrence === 'once' && rule.timeOfDay === hhmm);

      if (matches) {
        jarvisStore.recordAutomationRun(
          rule.id,
          `Scheduled trigger fired at ${hhmm}: ${rule.hindiPrompt}`,
          'triggered'
        );
        if (rule.recurrence === 'once') {
          jarvisStore.toggleAutomation(rule.id, false);
        }
        broadcastEvent({
          type: 'automation_triggered',
          title: rule.title,
          message: rule.hindiPrompt,
        });
      }
    }
  }, 15_000);

  // Vite dev middleware or production static files
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`JARVIS Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
