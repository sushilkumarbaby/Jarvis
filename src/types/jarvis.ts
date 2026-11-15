export type VoiceOrbState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'executing';

export type MemoryCategory =
  | 'preference'
  | 'project'
  | 'command'
  | 'instruction'
  | 'task'
  | 'conversation';

export interface MemoryItem {
  id: string;
  category: MemoryCategory;
  key: string;
  value: string;
  updatedAt: string;
}

export type SpecialistAgentId =
  | 'research'
  | 'coding'
  | 'android'
  | 'browser'
  | 'automation'
  | 'image'
  | 'video'
  | 'voice'
  | 'data'
  | 'files'
  | 'security';

export interface AgentRunLog {
  id: string;
  agent: SpecialistAgentId;
  agentLabel: string;
  prompt: string;
  summary: string;
  status: 'completed' | 'verified' | 'failed';
  provider: string;
  latencyMs: number;
  createdAt: string;
}

export interface AutomationRule {
  id: string;
  title: string;
  hindiPrompt: string;
  cronLabel: string;
  timeOfDay: string;
  recurrence: 'daily' | 'weekdays' | 'once' | 'hourly';
  enabled: boolean;
  retries: number;
  maxRetries: number;
  lastRunAt: string | null;
  lastStatus: 'pending' | 'success' | 'retrying' | 'failed';
  createdAt: string;
}

export interface WorkflowHistoryEntry {
  id: string;
  automationId: string;
  title: string;
  message: string;
  status: 'triggered' | 'completed' | 'failed';
  timestamp: string;
}

export type ProviderId = 'gemini' | 'openai' | 'anthropic' | 'openrouter' | 'ollama';

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  enabled: boolean;
  priority: number;
  model: string;
  baseUrl?: string;
  hasKey: boolean;
  status: 'ready' | 'unconfigured' | 'fallback';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'jarvis';
  text: string;
  language: 'hi' | 'hinglish' | 'en';
  agentUsed?: SpecialistAgentId;
  providerUsed?: string;
  groundingUrls?: { title: string; uri: string }[];
  actionResult?: string;
  createdAt: string;
}

export interface StudioArtifact {
  id: string;
  type: 'youtube_video' | 'document' | 'presentation' | 'website' | 'android_code';
  title: string;
  topic: string;
  language: string;
  scriptMarkdown: string;
  subtitlesSrt?: string;
  thumbnailHeadline?: string;
  thumbnailSubtext?: string;
  hasVoiceover?: boolean;
  createdAt: string;
}

export type VoiceTone = 'Calm' | 'Enthusiastic' | 'Formal' | 'Friendly' | 'Empathetic';

export interface JarvisSettings {
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
}

export interface EnvironmentInfo {
  os: string;
  nodeVersion: string;
  hasJava: boolean;
  hasGradle: boolean;
  hasAndroidSdk: boolean;
  hasAdb: boolean;
  hasGeminiKey: boolean;
}

export interface JarvisSnapshot {
  memories: MemoryItem[];
  messages: ChatMessage[];
  automations: AutomationRule[];
  workflowHistory: WorkflowHistoryEntry[];
  agentRuns: AgentRunLog[];
  providers: ProviderConfig[];
  studioArtifacts: StudioArtifact[];
  settings: JarvisSettings;
  environment?: EnvironmentInfo;
}
