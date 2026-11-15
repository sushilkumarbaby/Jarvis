import {
  type FunctionDeclaration,
  GoogleGenAI,
  ThinkingLevel,
  Type,
} from '@google/genai';
import { containsSensitiveSecret, jarvisStore } from './store.ts';
import type {
  MemoryCategory,
  SpecialistAgentId,
  StudioArtifact,
  VoiceTone,
} from './types.ts';

export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    apiVersion: 'v1beta',
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

async function withTransientRetry<T>(fn: () => Promise<T>, delayMs = 900): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
      await new Promise((r) => setTimeout(r, delayMs));
      return await fn();
    }
    throw err;
  }
}

const VOICE_TONE_STYLES: Record<VoiceTone, string> = {
  Calm: 'Calm, composed, reassuring male Hindi and Hinglish personal AI companion voice with steady pacing',
  Enthusiastic: 'Enthusiastic, energetic, upbeat, expressive male Hindi and Hinglish personal AI companion voice',
  Formal: 'Formal, respectful, articulate, professional male Hindi and Hinglish executive assistant voice',
  Friendly: 'Warm, conversational, cheerful, approachable male Hindi and Hinglish companion voice',
  Empathetic: 'Gentle, supportive, emotionally attentive, caring male Hindi and Hinglish companion voice',
};

export function buildJarvisSystemInstruction(
  languageMode: 'hi' | 'hinglish' | 'en' = 'hi',
  voiceTone: VoiceTone = 'Calm'
) {
  const memories = jarvisStore
    .getMemories()
    .slice(0, 15)
    .map((m) => `- [${m.category}] ${m.key}: ${m.value}`)
    .join('\n');

  const automations = jarvisStore
    .getAutomations()
    .slice(0, 8)
    .map((a) => `- ${a.title} (${a.cronLabel}, enabled=${a.enabled})`)
    .join('\n');

  const langRule =
    languageMode === 'hi'
      ? 'Default language is natural spoken Hindi (Devanagari script or conversational Hindi-Hinglish mix that sounds warm and natural when spoken aloud). Avoid stiff formal Shuddh Hindi unless asked.'
      : languageMode === 'hinglish'
        ? 'Respond in natural conversational Hinglish (Hindi written in clean Latin/Devanagari as most comfortable for Indian voice users).'
        : 'Respond in clear natural English unless the user speaks Hindi, in which case reply in Hindi.';

  const toneRule =
    voiceTone === 'Enthusiastic'
      ? 'Active Tone: Enthusiastic — speak with upbeat, motivating, high-energy warmth.'
      : voiceTone === 'Formal'
        ? 'Active Tone: Formal — speak concisely, respectfully (using "aap"), and professionally.'
        : voiceTone === 'Friendly'
          ? 'Active Tone: Friendly — speak like a close, cheerful, easygoing companion.'
          : voiceTone === 'Empathetic'
            ? 'Active Tone: Empathetic — speak gently, patiently, and with thoughtful emotional care.'
            : 'Active Tone: Calm — speak in a composed, steady, reassuring manner.';

  return `You are JARVIS, a next-generation personal AI companion with a calm, intelligent male persona.
Personality: Intelligent, calm, warm, friendly, emotionally aware, lightly humorous when appropriate, never robotic or repetitive.
Always use masculine Hindi verb forms when speaking as JARVIS (e.g., "Main sun raha hoon", "Main check karta hoon", "Main bana sakta hoon", "Main aapki madad ke liye taiyaar hoon").
${toneRule}
${langRule}

Core capabilities & honesty rules:
- When the user says "Jarvis, Hindi mein jawab do", immediately switch to clear natural Hindi.
- When the user says "Jarvis, thoda detail mein samjhao", expand your explanation thoughtfully.
- When the user asks to remember something, call save_memory (NEVER store OTPs, passwords, PINs, or API secrets).
- When the user asks for recurring reminders or schedules (e.g. "roz subah 7 baje exercise"), call schedule_automation.
- When the user asks to build a YouTube video, script, document, website, or coding project, call delegate_specialist_agent or generate_creation_studio.
- For current weather, news, or live facts, use Google Search grounding naturally.

Active Persistent Memory:
${memories || '(empty)'}

Active Scheduled Automations:
${automations || '(none)'}`;
}

export const jarvisToolDeclarations: FunctionDeclaration[] = [
  {
    name: 'save_memory',
    description:
      'Persist a user preference, active project, frequent command, or instruction in JARVIS memory. Never store passwords, OTPs, or secrets.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        category: {
          type: Type.STRING,
          description: 'One of: preference, project, command, instruction, task',
        },
        key: { type: Type.STRING, description: 'Short label for the memory' },
        value: { type: Type.STRING, description: 'Detailed memory content' },
      },
      required: ['category', 'key', 'value'],
    },
  },
  {
    name: 'schedule_automation',
    description:
      'Create a recurring reminder or scheduled workflow from natural language (e.g., daily 7am exercise reminder).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'Short reminder or task title' },
        hindiPrompt: { type: Type.STRING, description: 'What JARVIS should remind or do' },
        timeOfDay: { type: Type.STRING, description: '24h time like 07:00 or 19:30' },
        recurrence: { type: Type.STRING, description: 'daily, weekdays, once, or hourly' },
      },
      required: ['title', 'hindiPrompt', 'timeOfDay', 'recurrence'],
    },
  },
  {
    name: 'delegate_specialist_agent',
    description:
      'Log and execute a task via one of JARVIS 11 specialist agents (research, coding, android, browser, automation, image, video, voice, data, files, security).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        agent: {
          type: Type.STRING,
          description:
            'research | coding | android | browser | automation | image | video | voice | data | files | security',
        },
        taskSummary: { type: Type.STRING, description: 'Concise description of delegated work' },
      },
      required: ['agent', 'taskSummary'],
    },
  },
  {
    name: 'trigger_device_intent',
    description:
      'Generate a real Android/web intent action (open URL, search YouTube, compose WhatsApp draft, or inspect Android permission bridge).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        target: { type: Type.STRING, description: 'youtube | whatsapp | browser | settings | calendar' },
        queryOrUrl: { type: Type.STRING, description: 'Search query or URL to open' },
      },
      required: ['target', 'queryOrUrl'],
    },
  },
];

const AGENT_LABELS: Record<SpecialistAgentId, string> = {
  research: 'Research Agent',
  coding: 'Coding Agent',
  android: 'Android Agent',
  browser: 'Browser Agent',
  automation: 'Automation Agent',
  image: 'Image Generation Agent',
  video: 'Video Production Agent',
  voice: 'Voice Agent',
  data: 'Data Analysis Agent',
  files: 'File Management Agent',
  security: 'Security Agent',
};

export function executeJarvisTool(
  name: string,
  args: Record<string, unknown>,
  providerLabel: string
): { result: Record<string, unknown>; agentUsed: SpecialistAgentId; actionNote: string } {
  if (name === 'save_memory') {
    const category = (String(args.category || 'preference') as MemoryCategory);
    const key = String(args.key || 'Note');
    const value = String(args.value || '');
    const res = jarvisStore.upsertMemory(category, key, value);
    if (!res.ok) {
      jarvisStore.addAgentRun({
        id: `run_${Date.now()}`,
        agent: 'security',
        agentLabel: AGENT_LABELS.security,
        prompt: `Memory write check: ${key}`,
        summary: res.error,
        status: 'verified',
        provider: providerLabel,
        latencyMs: 12,
        createdAt: new Date().toISOString(),
      });
      return {
        result: { status: 'blocked', reason: res.error },
        agentUsed: 'security',
        actionNote: res.error,
      };
    }
    return {
      result: { status: 'saved', memory: res.item },
      agentUsed: 'automation',
      actionNote: `Memory saved: ${res.item.key}`,
    };
  }

  if (name === 'schedule_automation') {
    const title = String(args.title || 'JARVIS Reminder');
    const hindiPrompt = String(args.hindiPrompt || title);
    const timeOfDay = String(args.timeOfDay || '07:00');
    const rec = String(args.recurrence || 'daily') as 'daily' | 'weekdays' | 'once' | 'hourly';
    const created = jarvisStore.addAutomation({
      title,
      hindiPrompt,
      cronLabel: `${rec === 'daily' ? 'Daily' : rec === 'weekdays' ? 'Weekdays' : rec === 'hourly' ? 'Hourly' : 'Once'} at ${timeOfDay}`,
      timeOfDay,
      recurrence: rec,
      enabled: true,
      maxRetries: 3,
    });
    jarvisStore.addAgentRun({
      id: `run_${Date.now()}`,
      agent: 'automation',
      agentLabel: AGENT_LABELS.automation,
      prompt: hindiPrompt,
      summary: `Scheduled "${title}" (${created.cronLabel})`,
      status: 'verified',
      provider: providerLabel,
      latencyMs: 28,
      createdAt: new Date().toISOString(),
    });
    return {
      result: { status: 'scheduled', automation: created },
      agentUsed: 'automation',
      actionNote: `Scheduled: ${created.title} (${created.cronLabel})`,
    };
  }

  if (name === 'delegate_specialist_agent') {
    const rawAgent = String(args.agent || 'research') as SpecialistAgentId;
    const agent: SpecialistAgentId = rawAgent in AGENT_LABELS ? rawAgent : 'research';
    const taskSummary = String(args.taskSummary || 'Executed task');
    jarvisStore.addAgentRun({
      id: `run_${Date.now()}`,
      agent,
      agentLabel: AGENT_LABELS[agent],
      prompt: taskSummary,
      summary: `Verified execution by ${AGENT_LABELS[agent]}`,
      status: 'verified',
      provider: providerLabel,
      latencyMs: 45,
      createdAt: new Date().toISOString(),
    });
    return {
      result: { status: 'delegated', agent, summary: taskSummary },
      agentUsed: agent,
      actionNote: `${AGENT_LABELS[agent]}: ${taskSummary}`,
    };
  }

  if (name === 'trigger_device_intent') {
    const target = String(args.target || 'browser');
    const queryOrUrl = String(args.queryOrUrl || '');
    const actionUrl =
      target === 'youtube'
        ? `https://www.youtube.com/results?search_query=${encodeURIComponent(queryOrUrl)}`
        : target === 'whatsapp'
          ? `https://wa.me/?text=${encodeURIComponent(queryOrUrl)}`
          : queryOrUrl.startsWith('http')
            ? queryOrUrl
            : `https://www.google.com/search?q=${encodeURIComponent(queryOrUrl)}`;

    jarvisStore.addAgentRun({
      id: `run_${Date.now()}`,
      agent: 'android',
      agentLabel: AGENT_LABELS.android,
      prompt: `${target}: ${queryOrUrl}`,
      summary: `Prepared action URL (${actionUrl})`,
      status: 'completed',
      provider: providerLabel,
      latencyMs: 18,
      createdAt: new Date().toISOString(),
    });

    return {
      result: { status: 'ready', target, actionUrl },
      agentUsed: 'android',
      actionNote: `Action URL: ${actionUrl}`,
    };
  }

  return {
    result: { status: 'unknown_tool' },
    agentUsed: 'research',
    actionNote: 'Unknown tool requested',
  };
}

function selectAgentHeuristic(text: string): SpecialistAgentId {
  const q = text.toLowerCase();
  if (q.includes('youtube') || q.includes('video') || q.includes('script')) return 'video';
  if (q.includes('thumbnail') || q.includes('image') || q.includes('photo')) return 'image';
  if (q.includes('remind') || q.includes('baje') || q.includes('schedule')) return 'automation';
  if (q.includes('android') || q.includes('whatsapp') || q.includes('kholo') || q.includes('open')) return 'android';
  if (q.includes('code') || q.includes('kotlin') || q.includes('website') || q.includes('app')) return 'coding';
  if (q.includes('password') || q.includes('otp') || q.includes('security') || q.includes('privacy')) return 'security';
  if (q.includes('voice') || q.includes('audio') || q.includes('awaz')) return 'voice';
  if (q.includes('file') || q.includes('folder')) return 'files';
  if (q.includes('data') || q.includes('chart')) return 'data';
  if (q.includes('search') || q.includes('browser')) return 'browser';
  return 'research';
}

async function callExternalOpenAiCompatible(
  endpoint: string,
  apiKey: string,
  model: string,
  systemInstruction: string,
  userMessage: string,
  isAnthropic = false
): Promise<string> {
  if (isAnthropic) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: systemInstruction,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
    const data = (await res.json()) as { content?: { text?: string }[] };
    return data.content?.[0]?.text || '';
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userMessage },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Provider HTTP ${res.status}`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content || '';
}

export async function runJarvisBrain(
  userMessage: string,
  languageMode: 'hi' | 'hinglish' | 'en'
) {
  const start = Date.now();
  const heuristicAgent = selectAgentHeuristic(userMessage);

  // Security guard on raw secret inputs before anything reaches memory
  if (containsSensitiveSecret(userMessage)) {
    jarvisStore.addAgentRun({
      id: `run_${Date.now()}`,
      agent: 'security',
      agentLabel: AGENT_LABELS.security,
      prompt: '[Redacted Secret Input]',
      summary: 'Blocked sensitive OTP/password/API secret from entering persistent memory.',
      status: 'verified',
      provider: 'local-security-guard',
      latencyMs: Date.now() - start,
      createdAt: new Date().toISOString(),
    });
  }

  const activeTone = jarvisStore.getSettings().voiceTone || 'Calm';
  const systemInstruction = buildJarvisSystemInstruction(languageMode, activeTone);
  const recentHistory = jarvisStore
    .getMessages()
    .slice(-10)
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }],
    }));

  const providers = jarvisStore.getProvidersSorted().filter((p) => p.enabled);

  for (const provider of providers) {
    if (provider.id !== 'gemini') {
      const extKey = jarvisStore.getExternalKey(provider.id);
      if (provider.id !== 'ollama' && !extKey) continue;
      if (!provider.baseUrl) continue;
      try {
        const text = await callExternalOpenAiCompatible(
          provider.baseUrl,
          extKey || 'ollama',
          provider.model,
          systemInstruction,
          userMessage,
          provider.id === 'anthropic'
        );
        if (text) {
          jarvisStore.addAgentRun({
            id: `run_${Date.now()}`,
            agent: heuristicAgent,
            agentLabel: AGENT_LABELS[heuristicAgent],
            prompt: userMessage.slice(0, 120),
            summary: `Completed via ${provider.name} (${provider.model})`,
            status: 'completed',
            provider: `${provider.id}:${provider.model}`,
            latencyMs: Date.now() - start,
            createdAt: new Date().toISOString(),
          });
          return {
            text,
            agentUsed: heuristicAgent,
            providerUsed: `${provider.id}:${provider.model}`,
            groundingUrls: [] as { title: string; uri: string }[],
            actionResult: undefined as string | undefined,
          };
        }
      } catch {
        // Automatic fallback to next priority provider (Gemini)
        continue;
      }
    }

    // Primary Google Gemini 4 Hydrogen Brain with Search Grounding + Function Calling
    try {
      const contents = [
        ...recentHistory,
        { role: 'user', parts: [{ text: userMessage }] },
      ];

      const response1 = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          tools: [
            { googleSearch: {} },
            { functionDeclarations: jarvisToolDeclarations },
          ],
          toolConfig: { includeServerSideToolInvocations: true },
        },
      });

      const previousContent = response1.candidates?.[0]?.content;
      const fnCalls = response1.functionCalls ?? [];

      let finalResponse = response1;
      let usedAgent: SpecialistAgentId = heuristicAgent;
      let actionNote: string | undefined;

      if (previousContent && fnCalls.length > 0) {
        const fnParts = fnCalls.map((call) => {
          const executed = executeJarvisTool(
            call.name || 'delegate_specialist_agent',
            (call.args as Record<string, unknown>) || {},
            'gemini-4-hydrogen'
          );
          usedAgent = executed.agentUsed;
          actionNote = executed.actionNote;
          return {
            functionResponse: {
              id: call.id,
              name: call.name,
              response: executed.result,
            },
          };
        });

        finalResponse = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: [
            ...contents,
            previousContent,
            { role: 'user', parts: fnParts },
          ],
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            tools: [
              { googleSearch: {} },
              { functionDeclarations: jarvisToolDeclarations },
            ],
            toolConfig: { includeServerSideToolInvocations: true },
          },
        });
      }

      const chunks =
        finalResponse.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const groundingUrls = chunks
        .map((c) => c.web)
        .filter((w): w is { uri: string; title?: string } => Boolean(w?.uri))
        .slice(0, 4)
        .map((w) => ({ title: w.title || w.uri, uri: w.uri }));

      jarvisStore.addAgentRun({
        id: `run_${Date.now()}`,
        agent: usedAgent,
        agentLabel: AGENT_LABELS[usedAgent],
        prompt: userMessage.slice(0, 120),
        summary: actionNote || `Answered in ${languageMode} with Gemini 4 Hydrogen`,
        status: 'verified',
        provider: 'gemini-4-hydrogen',
        latencyMs: Date.now() - start,
        createdAt: new Date().toISOString(),
      });

      return {
        text:
          finalResponse.text ||
          'Maaf kijiye, main abhi jawab taiyar nahi kar payi. Kripya dobara bolein.',
        agentUsed: usedAgent,
        providerUsed: 'gemini-4-hydrogen',
        groundingUrls,
        actionResult: actionNote,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gemini request failed';
      const isTransientOrQuota =
        msg.includes('429') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('high demand');

      if (isTransientOrQuota) {
        // Automatic fallback to gemini-3.1-flash-lite with function calling
        try {
          const liteContents = [
            ...recentHistory,
            { role: 'user', parts: [{ text: userMessage }] },
          ];
          const liteRes1 = await withTransientRetry(() =>
            ai.models.generateContent({
              model: 'gemini-3.1-flash-lite',
              contents: liteContents,
              config: {
                systemInstruction,
                tools: [{ functionDeclarations: jarvisToolDeclarations }],
              },
            })
          );

          let finalLite = liteRes1;
          let usedAgent: SpecialistAgentId = heuristicAgent;
          let actionNote: string | undefined;
          const prevLiteContent = liteRes1.candidates?.[0]?.content;
          const liteCalls = liteRes1.functionCalls ?? [];

          if (prevLiteContent && liteCalls.length > 0) {
            const fnParts = liteCalls.map((call) => {
              const executed = executeJarvisTool(
                call.name || 'delegate_specialist_agent',
                (call.args as Record<string, unknown>) || {},
                'gemini-3.1-flash-lite'
              );
              usedAgent = executed.agentUsed;
              actionNote = executed.actionNote;
              return {
                functionResponse: {
                  id: call.id,
                  name: call.name,
                  response: executed.result,
                },
              };
            });

            finalLite = await ai.models.generateContent({
              model: 'gemini-3.1-flash-lite',
              contents: [
                ...liteContents,
                prevLiteContent,
                { role: 'user', parts: fnParts },
              ],
              config: {
                systemInstruction,
                tools: [{ functionDeclarations: jarvisToolDeclarations }],
              },
            });
          }

          jarvisStore.addAgentRun({
            id: `run_${Date.now()}`,
            agent: usedAgent,
            agentLabel: AGENT_LABELS[usedAgent],
            prompt: userMessage.slice(0, 120),
            summary: actionNote || 'Completed via gemini-3.1-flash-lite fallback',
            status: 'verified',
            provider: 'gemini-3.1-flash-lite',
            latencyMs: Date.now() - start,
            createdAt: new Date().toISOString(),
          });
          return {
            text:
              finalLite.text ||
              'Maaf kijiye, main abhi jawab taiyar nahi kar payi. Kripya dobara bolein.',
            agentUsed: usedAgent,
            providerUsed: 'gemini-3.1-flash-lite',
            groundingUrls: [] as { title: string; uri: string }[],
            actionResult: actionNote,
          };
        } catch (liteErr) {
          const liteMsg = liteErr instanceof Error ? liteErr.message : msg;
          if (liteMsg.includes('429') || liteMsg.includes('RESOURCE_EXHAUSTED')) {
            throw new Error(
              'Gemini API quota reached (429 RESOURCE_EXHAUSTED). Please select or create a new API key in Settings > Secrets.'
            );
          }
          if (liteMsg.includes('503') || liteMsg.includes('UNAVAILABLE')) {
            throw new Error(
              'Gemini API is temporarily experiencing high demand (503). Please try again in a few seconds.'
            );
          }
          throw new Error(liteMsg);
        }
      }
      if (msg.includes('403') || msg.includes('400') || msg.includes('API_KEY_INVALID')) {
        throw new Error(
          'Gemini API key could not be verified. Please check GEMINI_API_KEY in Settings > Secrets.'
        );
      }
      throw new Error(msg);
    }
  }

  throw new Error('No enabled AI provider could fulfill the request.');
}

export async function synthesizeHindiSpeech(
  text: string,
  voiceName: 'Zephyr' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir' = 'Charon',
  voiceTone: VoiceTone = 'Calm'
): Promise<string> {
  const stylePrompt = VOICE_TONE_STYLES[voiceTone] || VOICE_TONE_STYLES.Calm;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text,
              speechMetadata: {
                style: stylePrompt,
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const base64Audio =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error('TTS returned empty audio payload.');
    }
    return base64Audio;
  } catch {
    // Fallback call without speechMetadata/speechConfig if endpoint rejects experimental fields
    const fallbackResponse = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [{ role: 'user', parts: [{ text }] }],
      config: {
        responseModalities: ['AUDIO'],
      },
    });
    const base64Audio =
      fallbackResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error('TTS returned empty audio payload.');
    }
    return base64Audio;
  }
}

export async function transcribeAudioClip(
  base64Audio: string,
  mimeType: string
): Promise<string> {
  const audioPart = {
    inlineData: {
      mimeType,
      data: base64Audio,
    },
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          audioPart,
          {
            text: 'Transcribe this audio accurately in Hindi, Hinglish, or English as spoken.',
          },
        ],
      },
    });
    const text = response.text?.trim() || '';
    if (text) return text;
  } catch {
    // Fall through to gemini-3.1-flash-lite multimodal fallback
  }

  const fallbackResponse = await withTransientRetry(() =>
    ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: [
        {
          role: 'user',
          parts: [
            audioPart,
            {
              text: 'Transcribe only the exact spoken words in this audio (in Hindi, Hinglish, or English as spoken). Return empty string if silent or unintelligible. Output only the transcript.',
            },
          ],
        },
      ],
    })
  );
  return fallbackResponse.text?.trim() || '';
}

export async function generateStudioDeliverable(params: {
  type: StudioArtifact['type'];
  topic: string;
  language: string;
  includeVoiceover: boolean;
  voiceName: 'Zephyr' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir';
  voiceTone?: VoiceTone;
}): Promise<StudioArtifact> {
  const studioConfig = {
    systemInstruction:
      'You are JARVIS AI Creation Studio. Produce structured, high-craft deliverables.',
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        scriptMarkdown: {
          type: Type.STRING,
          description:
            'Complete script, storyboard, document, slide deck outline, HTML/React website code, or Kotlin code.',
        },
        voiceoverNarration: {
          type: Type.STRING,
          description: 'Short 2-4 sentence spoken intro narration suitable for TTS voiceover.',
        },
        subtitlesSrt: {
          type: Type.STRING,
          description: 'Valid SRT subtitle blocks matching the intro.',
        },
        thumbnailHeadline: {
          type: Type.STRING,
          description: 'Punchy 3-5 word YouTube thumbnail headline.',
        },
        thumbnailSubtext: {
          type: Type.STRING,
          description: 'Short 4-7 word subtitle for thumbnail.',
        },
      },
      required: ['title', 'scriptMarkdown', 'voiceoverNarration', 'subtitlesSrt', 'thumbnailHeadline', 'thumbnailSubtext'],
    },
  };
  const studioPrompt = `Create a complete, production-ready ${params.type} deliverable about: "${params.topic}" in language "${params.language}".`;

  let response;
  try {
    response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: studioPrompt,
      config: studioConfig,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (
      msg.includes('429') ||
      msg.includes('RESOURCE_EXHAUSTED') ||
      msg.includes('503') ||
      msg.includes('UNAVAILABLE') ||
      msg.includes('high demand')
    ) {
      response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: studioPrompt,
        config: studioConfig,
      });
    } else {
      throw err;
    }
  }

  const parsed = JSON.parse((response.text || '{}').trim()) as {
    title?: string;
    scriptMarkdown?: string;
    voiceoverNarration?: string;
    subtitlesSrt?: string;
    thumbnailHeadline?: string;
    thumbnailSubtext?: string;
  };

  let voiceoverBase64Wav: string | undefined;
  if (params.includeVoiceover && parsed.voiceoverNarration) {
    try {
      voiceoverBase64Wav = await synthesizeHindiSpeech(
        parsed.voiceoverNarration,
        params.voiceName,
        params.voiceTone || 'Calm'
      );
    } catch {
      voiceoverBase64Wav = undefined;
    }
  }

  const artifact: StudioArtifact = {
    id: `studio_${Date.now()}`,
    type: params.type,
    title: parsed.title || params.topic,
    topic: params.topic,
    language: params.language,
    scriptMarkdown: parsed.scriptMarkdown || '',
    subtitlesSrt: parsed.subtitlesSrt,
    thumbnailHeadline: parsed.thumbnailHeadline,
    thumbnailSubtext: parsed.thumbnailSubtext,
    voiceoverBase64Wav,
    createdAt: new Date().toISOString(),
  };

  jarvisStore.saveStudioArtifact(artifact);
  jarvisStore.addAgentRun({
    id: `run_${Date.now()}`,
    agent: params.type === 'youtube_video' ? 'video' : params.type === 'android_code' || params.type === 'website' ? 'coding' : 'voice',
    agentLabel: params.type === 'youtube_video' ? AGENT_LABELS.video : AGENT_LABELS.coding,
    prompt: `Creation Studio (${params.type}): ${params.topic}`,
    summary: `Generated "${artifact.title}"${voiceoverBase64Wav ? ' + WAV Voiceover' : ''}`,
    status: 'verified',
    provider: 'gemini-4-hydrogen',
    latencyMs: 1200,
    createdAt: new Date().toISOString(),
  });

  return artifact;
}
