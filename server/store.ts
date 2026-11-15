import fs from 'node:fs';
import path from 'node:path';
import type {
  AgentRunLog,
  AutomationRule,
  ChatMessage,
  MemoryCategory,
  MemoryItem,
  ProviderConfig,
  ProviderId,
  StudioArtifact,
  VoiceTone,
  WorkflowHistoryEntry,
} from './types.ts';

interface JarvisDatabase {
  memories: MemoryItem[];
  messages: ChatMessage[];
  automations: AutomationRule[];
  workflowHistory: WorkflowHistoryEntry[];
  agentRuns: AgentRunLog[];
  providers: ProviderConfig[];
  externalKeys: Partial<Record<ProviderId, string>>;
  studioArtifacts: StudioArtifact[];
  settings: {
    defaultLanguage: 'hi' | 'hinglish' | 'en';
    wakeWordEnabled: boolean;
    wakeWordSensitivity: number;
    voiceName: 'Zephyr' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir';
    voiceTone: VoiceTone;
    speechRate: number;
    permissions: {
      microphone: boolean;
      notifications: boolean;
      accessibilityBridge: boolean;
      lockScreenMode: boolean;
    };
  };
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'jarvis-store.json');

const SECRET_PATTERNS = [
  /\b\d{4,8}\b(?=.*\b(otp|pin|code|passcode)\b)/i,
  /(password|passwd|pin|otp|cvv|secret|bearer)\s*[:=is]+\s*\S+/i,
  /AIza[0-9A-Za-z\-_]{20,}/,
  /sk-[0-9A-Za-z\-_]{16,}/,
  /ghp_[0-9A-Za-z]{20,}/,
  /sk-ant-[0-9A-Za-z\-_]{16,}/,
];

export function containsSensitiveSecret(input: string): boolean {
  return SECRET_PATTERNS.some((rx) => rx.test(input));
}

function createInitialDb(): JarvisDatabase {
  const now = new Date().toISOString();
  return {
    memories: [
      {
        id: 'pref_language',
        category: 'preference',
        key: 'Primary Voice Language',
        value: 'Hindi / Natural Hinglish (friendly, calm companion tone)',
        updatedAt: now,
      },
      {
        id: 'proj_jarvis',
        category: 'project',
        key: 'Project JARVIS Android',
        value: 'Building Hindi-first hands-free Android voice AI assistant with Kotlin & Gemini Live',
        updatedAt: now,
      },
      {
        id: 'inst_privacy',
        category: 'instruction',
        key: 'Security Boundary',
        value: 'Never store passwords, OTPs, or API secrets in conversational memory.',
        updatedAt: now,
      },
    ],
    messages: [
      {
        id: 'msg_welcome',
        role: 'jarvis',
        text: 'Namaste! Main JARVIS hoon. Aap mujhse "Jarvis" bolkar ya neeche type karke Hindi, Hinglish ya English mein baat kar sakte hain.',
        language: 'hinglish',
        agentUsed: 'voice',
        providerUsed: 'gemini-4-hydrogen',
        createdAt: now,
      },
    ],
    automations: [
      {
        id: 'auto_morning_exercise',
        title: 'Subah Exercise Reminder',
        hindiPrompt: 'Roz subah 7 baje mujhe remind karna ki main exercise karun',
        cronLabel: 'Daily at 07:00',
        timeOfDay: '07:00',
        recurrence: 'daily',
        enabled: true,
        retries: 0,
        maxRetries: 3,
        lastRunAt: null,
        lastStatus: 'pending',
        createdAt: now,
      },
    ],
    workflowHistory: [],
    agentRuns: [],
    providers: [
      {
        id: 'gemini',
        name: 'Google Gemini (Primary + Live Audio)',
        enabled: true,
        priority: 1,
        model: 'gemini-4-hydrogen / gemini-3.8-live',
        hasKey: Boolean(process.env.GEMINI_API_KEY),
        status: process.env.GEMINI_API_KEY ? 'ready' : 'unconfigured',
      },
      {
        id: 'openrouter',
        name: 'OpenRouter Multi-Model Gateway',
        enabled: false,
        priority: 2,
        model: 'google/gemini-2.5-flash',
        baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
        hasKey: false,
        status: 'unconfigured',
      },
      {
        id: 'openai',
        name: 'OpenAI-Compatible Endpoint',
        enabled: false,
        priority: 3,
        model: 'gpt-4o-mini',
        baseUrl: 'https://api.openai.com/v1/chat/completions',
        hasKey: false,
        status: 'unconfigured',
      },
      {
        id: 'anthropic',
        name: 'Anthropic Claude',
        enabled: false,
        priority: 4,
        model: 'claude-3-5-sonnet-latest',
        baseUrl: 'https://api.anthropic.com/v1/messages',
        hasKey: false,
        status: 'unconfigured',
      },
      {
        id: 'ollama',
        name: 'Local AI Model (Ollama / Edge)',
        enabled: false,
        priority: 5,
        model: 'llama3.2:latest',
        baseUrl: 'http://127.0.0.1:11434/v1/chat/completions',
        hasKey: true,
        status: 'fallback',
      },
    ],
    externalKeys: {},
    studioArtifacts: [],
    settings: {
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
    },
  };
}

class Store {
  private db: JarvisDatabase;

  constructor() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_PATH)) {
      try {
        const raw = fs.readFileSync(DB_PATH, 'utf8');
        this.db = JSON.parse(raw) as JarvisDatabase;
        // Refresh Gemini env key presence
        const gemini = this.db.providers.find((p) => p.id === 'gemini');
        if (gemini) {
          gemini.hasKey = Boolean(process.env.GEMINI_API_KEY);
          gemini.status = process.env.GEMINI_API_KEY ? 'ready' : 'unconfigured';
        }
        if (!this.db.settings.voiceTone) {
          this.db.settings.voiceTone = 'Calm';
          this.save();
        }
      } catch {
        this.db = createInitialDb();
        this.save();
      }
    } else {
      this.db = createInitialDb();
      this.save();
    }
  }

  private save() {
    fs.writeFileSync(DB_PATH, JSON.stringify(this.db, null, 2), 'utf8');
  }

  getSnapshot() {
    return {
      memories: this.db.memories,
      messages: this.db.messages,
      automations: this.db.automations,
      workflowHistory: this.db.workflowHistory,
      agentRuns: this.db.agentRuns,
      providers: this.db.providers,
      studioArtifacts: this.db.studioArtifacts.map((a) => ({
        ...a,
        hasVoiceover: Boolean(a.voiceoverBase64Wav),
        voiceoverBase64Wav: undefined,
      })),
      settings: this.db.settings,
    };
  }

  getMemories(): MemoryItem[] {
    return this.db.memories;
  }

  upsertMemory(category: MemoryCategory, key: string, value: string): { ok: true; item: MemoryItem } | { ok: false; error: string } {
    if (containsSensitiveSecret(`${key} ${value}`)) {
      return {
        ok: false,
        error: 'Security Agent blocked memory write: passwords, OTPs, and API secrets cannot be stored in assistant memory.',
      };
    }
    const id = `${category}_${key.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 32)}`;
    const item: MemoryItem = {
      id,
      category,
      key: key.trim(),
      value: value.trim(),
      updatedAt: new Date().toISOString(),
    };
    this.db.memories = [item, ...this.db.memories.filter((m) => m.id !== id)].slice(0, 80);
    this.save();
    return { ok: true, item };
  }

  deleteMemory(id: string) {
    this.db.memories = this.db.memories.filter((m) => m.id !== id);
    this.save();
  }

  getMessages(): ChatMessage[] {
    return this.db.messages;
  }

  addMessage(msg: ChatMessage) {
    this.db.messages = [...this.db.messages, msg].slice(-100);
    this.save();
  }

  clearMessages() {
    this.db.messages = [];
    this.save();
  }

  addAgentRun(run: AgentRunLog) {
    this.db.agentRuns = [run, ...this.db.agentRuns].slice(0, 50);
    this.save();
  }

  addAutomation(rule: Omit<AutomationRule, 'id' | 'retries' | 'lastRunAt' | 'lastStatus' | 'createdAt'>): AutomationRule {
    const newRule: AutomationRule = {
      ...rule,
      id: `auto_${Date.now()}`,
      retries: 0,
      lastRunAt: null,
      lastStatus: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.db.automations = [newRule, ...this.db.automations];
    this.save();
    return newRule;
  }

  toggleAutomation(id: string, enabled: boolean) {
    this.db.automations = this.db.automations.map((a) =>
      a.id === id ? { ...a, enabled } : a
    );
    this.save();
  }

  deleteAutomation(id: string) {
    this.db.automations = this.db.automations.filter((a) => a.id !== id);
    this.save();
  }

  recordAutomationRun(id: string, message: string, status: 'triggered' | 'completed' | 'failed') {
    const rule = this.db.automations.find((a) => a.id === id);
    if (!rule) return null;
    const now = new Date().toISOString();
    rule.lastRunAt = now;
    rule.lastStatus = status === 'failed' ? 'retrying' : 'success';
    const entry: WorkflowHistoryEntry = {
      id: `wf_${Date.now()}`,
      automationId: id,
      title: rule.title,
      message,
      status,
      timestamp: now,
    };
    this.db.workflowHistory = [entry, ...this.db.workflowHistory].slice(0, 60);
    this.save();
    return entry;
  }

  getAutomations() {
    return this.db.automations;
  }

  updateProvider(id: ProviderId, patch: { enabled?: boolean; model?: string; baseUrl?: string; priority?: number; apiKey?: string }) {
    this.db.providers = this.db.providers.map((p) => {
      if (p.id !== id) return p;
      const updated = {
        ...p,
        enabled: patch.enabled ?? p.enabled,
        model: patch.model ?? p.model,
        baseUrl: patch.baseUrl ?? p.baseUrl,
        priority: patch.priority ?? p.priority,
      };
      if (patch.apiKey !== undefined && id !== 'gemini') {
        if (patch.apiKey.trim()) {
          this.db.externalKeys[id] = patch.apiKey.trim();
          updated.hasKey = true;
          updated.status = updated.enabled ? 'ready' : 'fallback';
        } else {
          delete this.db.externalKeys[id];
          updated.hasKey = false;
          updated.status = 'unconfigured';
        }
      }
      return updated;
    });
    this.save();
    return this.db.providers;
  }

  getProvidersSorted(): ProviderConfig[] {
    return [...this.db.providers].sort((a, b) => a.priority - b.priority);
  }

  getExternalKey(id: ProviderId): string | undefined {
    return this.db.externalKeys[id];
  }

  updateSettings(patch: Partial<JarvisDatabase['settings']>) {
    this.db.settings = {
      ...this.db.settings,
      ...patch,
      permissions: {
        ...this.db.settings.permissions,
        ...(patch.permissions ?? {}),
      },
    };
    this.save();
    return this.db.settings;
  }

  getSettings() {
    return this.db.settings;
  }

  saveStudioArtifact(artifact: StudioArtifact) {
    this.db.studioArtifacts = [artifact, ...this.db.studioArtifacts].slice(0, 20);
    this.save();
  }

  getStudioArtifactById(id: string): StudioArtifact | undefined {
    return this.db.studioArtifacts.find((a) => a.id === id);
  }
}

export const jarvisStore = new Store();
