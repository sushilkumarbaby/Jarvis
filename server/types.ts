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
  timeOfDay: string; // HH:MM 24h
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

export type ProviderId =
  | 'gemini'
  | 'openai'
  | 'anthropic'
  | 'openrouter'
  | 'ollama';

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
  voiceoverBase64Wav?: string;
  createdAt: string;
}

export type VoiceTone = 'Calm' | 'Enthusiastic' | 'Formal' | 'Friendly' | 'Empathetic';

