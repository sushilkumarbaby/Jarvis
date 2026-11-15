import React, { useState } from 'react';
import { Bot, CheckCircle2, Play, ServerCog } from 'lucide-react';
import type { AgentRunLog, ProviderConfig, ProviderId, SpecialistAgentId } from '../types/jarvis';

interface AgentsPanelProps {
  agentRuns: AgentRunLog[];
  providers: ProviderConfig[];
  onDispatchAgent: (prompt: string) => Promise<void>;
  onUpdateProvider: (
    id: ProviderId,
    patch: { enabled?: boolean; model?: string; baseUrl?: string; apiKey?: string }
  ) => Promise<void>;
}

const SPECIALIST_AGENTS: {
  id: SpecialistAgentId;
  name: string;
  role: string;
  sampleTask: string;
}[] = [
  { id: 'research', name: 'Research Agent', role: 'Live Google Search grounding & fact verification', sampleTask: 'Aaj ki top AI news Hindi mein summarize karo' },
  { id: 'coding', name: 'Coding Agent', role: 'Kotlin, TypeScript, Express & full-stack architecture', sampleTask: 'Android ForegroundService wake-word ka Kotlin pattern samjhao' },
  { id: 'android', name: 'Android Agent', role: 'Intents, Accessibility UI automation & Shizuku/Tasker hooks', sampleTask: 'YouTube kholne aur search karne ka Android intent banao' },
  { id: 'browser', name: 'Browser Agent', role: 'Web search, URL context & portal automation', sampleTask: 'Official Android VoiceInteractionService docs search karo' },
  { id: 'automation', name: 'Automation Agent', role: 'Recurring schedules, reminders, retries & n8n/MCP webhooks', sampleTask: 'Roz raat 10 baje reading reminder schedule karo' },
  { id: 'image', name: 'Image Generation Agent', role: 'Thumbnail composition, brand visuals & art direction', sampleTask: 'Tech YouTube thumbnail ka layout aur headline suggest karo' },
  { id: 'video', name: 'Video Production Agent', role: 'YouTube scripts, storyboards, SRT subtitles & editing flow', sampleTask: 'AI in 2026 par 60-second Hinglish YouTube Short script likho' },
  { id: 'voice', name: 'Voice Agent', role: 'Hindi/Hinglish TTS, voiceovers & real-time audio pipelines', sampleTask: 'Hindi morning motivation voiceover script likho' },
  { id: 'data', name: 'Data Analysis Agent', role: 'Structured metrics, logs & quantitative breakdowns', sampleTask: 'Daily productivity routine ka weekly tracking template banao' },
  { id: 'files', name: 'File Management Agent', role: 'Project organization, exports & document indexing', sampleTask: 'Android project structure organize karne ke best practices batao' },
  { id: 'security', name: 'Security Agent', role: 'Secret redaction, permissions audit & confirmation gates', sampleTask: 'Check karo ki password ya OTP memory mein save na ho' },
];

export const AgentsPanel: React.FC<AgentsPanelProps> = ({
  agentRuns,
  providers,
  onDispatchAgent,
  onUpdateProvider,
}) => {
  const [runningId, setRunningId] = useState<string | null>(null);
  const [editingProvider, setEditingProvider] = useState<ProviderId | null>(null);
  const [modelDraft, setModelDraft] = useState('');
  const [urlDraft, setUrlDraft] = useState('');
  const [keyDraft, setKeyDraft] = useState('');

  const handleRunAgent = async (id: string, sampleTask: string) => {
    setRunningId(id);
    try {
      await onDispatchAgent(sampleTask);
    } finally {
      setRunningId(null);
    }
  };

  const startEdit = (p: ProviderConfig) => {
    setEditingProvider(p.id);
    setModelDraft(p.model);
    setUrlDraft(p.baseUrl || '');
    setKeyDraft('');
  };

  const saveEdit = async (p: ProviderConfig) => {
    await onUpdateProvider(p.id, {
      model: modelDraft,
      baseUrl: urlDraft || p.baseUrl,
      ...(keyDraft.trim() ? { apiKey: keyDraft.trim() } : {}),
    });
    setEditingProvider(null);
    setKeyDraft('');
  };

  return (
    <div className="space-y-8">
      {/* 11 Specialist Agents Grid */}
      <section className="rounded-2xl border border-slate-800/80 bg-[#0F172A]/85 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-5 border-b border-slate-800/80">
          <div>
            <h2 className="font-display text-xl font-semibold text-slate-100">
              Multi-Agent Orchestrator
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              11 specialist agents coordinated by JARVIS central brain · Click Test to delegate a live task
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">
            11 Agents Registered
          </span>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {SPECIALIST_AGENTS.map((agent) => (
            <div
              key={agent.id}
              className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-4"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm text-slate-100 flex items-center gap-2">
                    <Bot className="w-4 h-4 text-sky-400 shrink-0" />
                    {agent.name}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    {agent.id}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                  {agent.role}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/70 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500 truncate">
                  {agent.sampleTask}
                </span>
                <button
                  type="button"
                  disabled={runningId === agent.id}
                  onClick={() => handleRunAgent(agent.id, agent.sampleTask)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 hover:border-sky-500/50 hover:text-sky-300 transition-colors whitespace-nowrap shrink-0 min-h-[36px]"
                >
                  <Play className="w-3 h-3" />
                  {runningId === agent.id ? 'Running…' : 'Run'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Model-Independent Multi-Provider Router */}
      <section className="rounded-2xl border border-slate-800/80 bg-[#0F172A]/85 p-6">
        <div className="pb-5 border-b border-slate-800/80">
          <h2 className="font-display text-xl font-semibold text-slate-100">
            Connected AI Providers &amp; Fallback Chain
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Model-independent routing · Google Gemini prioritized automatically with multi-provider fallback
          </p>
        </div>

        <div className="mt-4 divide-y divide-slate-800/80">
          {providers.map((p) => (
            <div key={p.id} className="py-4 flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
                    <ServerCog className="w-4 h-4 text-sky-400" />
                    <span>{p.name}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span>Priority {p.priority}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-slate-300">{p.model}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        p.hasKey ? 'text-emerald-400' : 'text-amber-400'
                      }
                    >
                      {p.id === 'gemini'
                        ? p.hasKey
                          ? 'Server Key Ready'
                          : 'Missing Server Secret'
                        : p.id === 'ollama'
                          ? 'Local Endpoint'
                          : p.hasKey
                            ? 'Configured'
                            : 'Optional Key Not Set'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {p.id !== 'gemini' && (
                    <button
                      type="button"
                      onClick={() =>
                        editingProvider === p.id
                          ? setEditingProvider(null)
                          : startEdit(p)
                      }
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 min-h-[36px]"
                    >
                      {editingProvider === p.id ? 'Cancel' : 'Configure'}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      onUpdateProvider(p.id, { enabled: !p.enabled })
                    }
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium min-h-[36px] transition-colors ${
                      p.enabled
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {p.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              </div>

              {editingProvider === p.id && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                  <input
                    type="text"
                    value={modelDraft}
                    onChange={(e) => setModelDraft(e.target.value)}
                    placeholder="Model ID"
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100"
                  />
                  <input
                    type="text"
                    value={urlDraft}
                    onChange={(e) => setUrlDraft(e.target.value)}
                    placeholder="Endpoint URL"
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100"
                  />
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={keyDraft}
                      onChange={(e) => setKeyDraft(e.target.value)}
                      placeholder="Provider token (optional)"
                      className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => saveEdit(p)}
                      className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-medium text-slate-950 hover:bg-sky-400"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Agent Execution Telemetry Table */}
      <section className="rounded-2xl border border-slate-800/80 bg-[#0F172A]/85 p-6">
        <div className="pb-4 border-b border-slate-800/80 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-slate-100">
            Recent Agent Activity
          </h2>
          <span className="text-xs font-mono text-slate-400">
            {agentRuns.length} executions
          </span>
        </div>

        {agentRuns.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            No specialist agent runs yet. Run any agent above or ask JARVIS a task.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 pr-4 font-medium">Agent</th>
                  <th className="py-2.5 pr-4 font-medium">Prompt / Task</th>
                  <th className="py-2.5 pr-4 font-medium">Result</th>
                  <th className="py-2.5 pr-4 font-medium">Provider</th>
                  <th className="py-2.5 text-right font-medium">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {agentRuns.map((run) => (
                  <tr key={run.id} className="hover:bg-slate-800/30">
                    <td className="py-3 pr-4 font-medium text-slate-200 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        {run.agentLabel}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-slate-300 max-w-xs truncate">
                      {run.prompt}
                    </td>
                    <td className="py-3 pr-4 text-slate-400 max-w-sm truncate">
                      {run.summary}
                    </td>
                    <td className="py-3 pr-4 font-mono text-slate-400 whitespace-nowrap">
                      {run.provider}
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                      {run.latencyMs} ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
