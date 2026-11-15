import React, { useState } from 'react';
import { Bell, CalendarClock, Play, Plus, Trash2 } from 'lucide-react';
import type { AutomationRule, WorkflowHistoryEntry } from '../types/jarvis';

interface AutomationPanelProps {
  automations: AutomationRule[];
  workflowHistory: WorkflowHistoryEntry[];
  onNaturalLanguageSchedule: (hindiCommand: string) => Promise<void>;
  onCreateRule: (rule: {
    title: string;
    hindiPrompt: string;
    timeOfDay: string;
    recurrence: 'daily' | 'weekdays' | 'once' | 'hourly';
  }) => Promise<void>;
  onToggleRule: (id: string, enabled: boolean) => Promise<void>;
  onDeleteRule: (id: string) => Promise<void>;
  onRunNow: (id: string) => Promise<void>;
}

export const AutomationPanel: React.FC<AutomationPanelProps> = ({
  automations,
  workflowHistory,
  onNaturalLanguageSchedule,
  onCreateRule,
  onToggleRule,
  onDeleteRule,
  onRunNow,
}) => {
  const [nlPrompt, setNlPrompt] = useState('');
  const [isParsing, setIsParsing] = useState(false);

  const [title, setTitle] = useState('');
  const [hindiPrompt, setHindiPrompt] = useState('');
  const [timeOfDay, setTimeOfDay] = useState('07:00');
  const [recurrence, setRecurrence] = useState<'daily' | 'weekdays' | 'once' | 'hourly'>('daily');
  const [notifPerm, setNotifPerm] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  const requestNotifications = async () => {
    if (typeof Notification === 'undefined') return;
    const res = await Notification.requestPermission();
    setNotifPerm(res);
  };

  const handleNaturalSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlPrompt.trim()) return;
    setIsParsing(true);
    try {
      await onNaturalLanguageSchedule(nlPrompt.trim());
      setNlPrompt('');
    } finally {
      setIsParsing(false);
    }
  };

  const handleManualCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await onCreateRule({
      title: title.trim(),
      hindiPrompt: (hindiPrompt || title).trim(),
      timeOfDay,
      recurrence,
    });
    setTitle('');
    setHindiPrompt('');
  };

  return (
    <div className="space-y-8">
      {/* Natural-Language Hindi Automation */}
      <section className="rounded-2xl border border-slate-800/80 bg-[#0F172A]/85 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-800/80">
          <div>
            <h2 className="font-display text-xl font-semibold text-slate-100">
              Natural-Language Automation Engine
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Hindi ya Hinglish mein schedule bolein — JARVIS automatic cron rule aur notification configure karti hai
            </p>
          </div>
          <button
            type="button"
            onClick={requestNotifications}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 min-h-[38px] whitespace-nowrap shrink-0"
          >
            <Bell className="w-3.5 h-3.5 text-sky-400" />
            Notifications: {notifPerm === 'granted' ? 'Allowed' : 'Enable Alerts'}
          </button>
        </div>

        <form onSubmit={handleNaturalSchedule} className="mt-5 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={nlPrompt}
            onChange={(e) => setNlPrompt(e.target.value)}
            placeholder='Example: "Roz subah 7 baje mujhe remind karna ki main exercise karun"'
            className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none min-h-[44px]"
          />
          <button
            type="submit"
            disabled={isParsing || !nlPrompt.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-50 transition-colors min-h-[44px] whitespace-nowrap shrink-0"
          >
            <CalendarClock className="w-4 h-4" />
            {isParsing ? 'Scheduling…' : 'Schedule with JARVIS'}
          </button>
        </form>

        {/* Manual Rule Builder */}
        <form onSubmit={handleManualCreate} className="mt-4 pt-4 border-t border-slate-800/70 grid grid-cols-1 md:grid-cols-12 gap-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task Title"
            className="md:col-span-3 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 min-h-[40px]"
          />
          <input
            type="text"
            value={hindiPrompt}
            onChange={(e) => setHindiPrompt(e.target.value)}
            placeholder="Spoken reminder text in Hindi/Hinglish"
            className="md:col-span-4 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 min-h-[40px]"
          />
          <input
            type="time"
            value={timeOfDay}
            onChange={(e) => setTimeOfDay(e.target.value)}
            className="md:col-span-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-mono text-slate-100 min-h-[40px]"
          />
          <select
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value as 'daily' | 'weekdays' | 'once' | 'hourly')}
            className="md:col-span-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 min-h-[40px]"
          >
            <option value="daily">Daily</option>
            <option value="weekdays">Weekdays</option>
            <option value="hourly">Hourly</option>
            <option value="once">Once</option>
          </select>
          <button
            type="submit"
            className="md:col-span-1 inline-flex items-center justify-center rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 hover:border-sky-500/50 min-h-[40px]"
            aria-label="Add rule"
          >
            <Plus className="w-4 h-4" />
          </button>
        </form>
      </section>

      {/* Active Rules List */}
      <section className="rounded-2xl border border-slate-800/80 bg-[#0F172A]/85 p-6">
        <div className="pb-4 border-b border-slate-800/80 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-slate-100">
            Active Schedules &amp; Automations
          </h3>
          <span className="text-xs font-mono text-slate-400">
            {automations.length} rules
          </span>
        </div>

        <div className="mt-4 divide-y divide-slate-800/80">
          {automations.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              No scheduled workflows yet.
            </p>
          ) : (
            automations.map((rule) => (
              <div
                key={rule.id}
                className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="font-mono text-sky-400">{rule.cronLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span>Retries {rule.retries}/{rule.maxRetries}</span>
                    <span aria-hidden="true">·</span>
                    <span className={rule.enabled ? 'text-emerald-400' : 'text-slate-500'}>
                      {rule.enabled ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <h4 className="mt-1 text-sm font-medium text-slate-100">
                    {rule.title}
                  </h4>
                  <p className="mt-0.5 text-xs text-slate-400">
                    “{rule.hindiPrompt}”
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onRunNow(rule.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 hover:border-sky-500/50 min-h-[36px]"
                  >
                    <Play className="w-3 h-3" />
                    Test Alert
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleRule(rule.id, !rule.enabled)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium min-h-[36px] border ${
                      rule.enabled
                        ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
                        : 'border-slate-700 bg-slate-900 text-slate-400'
                    }`}
                  >
                    {rule.enabled ? 'Enabled' : 'Paused'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteRule(rule.id)}
                    aria-label={`Delete ${rule.title}`}
                    className="rounded-lg p-2 text-slate-500 hover:text-rose-400 hover:bg-slate-800/70 min-w-[36px] min-h-[36px] flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Workflow Execution History */}
      <section className="rounded-2xl border border-slate-800/80 bg-[#0F172A]/85 p-6">
        <h3 className="font-display text-lg font-semibold text-slate-100 pb-4 border-b border-slate-800/80">
          Workflow History
        </h3>
        {workflowHistory.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            Click “Test Alert” on any schedule above or wait for a due trigger to inspect workflow history.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 pr-4 font-medium">Workflow</th>
                  <th className="py-2.5 pr-4 font-medium">Alert Output</th>
                  <th className="py-2.5 pr-4 font-medium">Status</th>
                  <th className="py-2.5 text-right font-medium">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {workflowHistory.map((h) => (
                  <tr key={h.id}>
                    <td className="py-3 pr-4 font-medium text-slate-200 whitespace-nowrap">
                      {h.title}
                    </td>
                    <td className="py-3 pr-4 text-slate-300">{h.message}</td>
                    <td className="py-3 pr-4 text-emerald-400 capitalize">{h.status}</td>
                    <td className="py-3 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">
                      {new Date(h.timestamp).toLocaleTimeString()}
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
