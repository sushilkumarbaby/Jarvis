import React, { useMemo, useState } from 'react';
import { Plus, Search, ShieldAlert, Trash2 } from 'lucide-react';
import type { MemoryCategory, MemoryItem } from '../types/jarvis';

interface MemoryPanelProps {
  memories: MemoryItem[];
  onSaveMemory: (category: MemoryCategory, key: string, value: string) => Promise<{ ok: boolean; error?: string }>;
  onDeleteMemory: (id: string) => Promise<void>;
}

const CATEGORIES: { id: 'all' | MemoryCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'preference', label: 'Preferences' },
  { id: 'project', label: 'Projects' },
  { id: 'command', label: 'Commands' },
  { id: 'instruction', label: 'Instructions' },
  { id: 'task', label: 'Ongoing Tasks' },
];

export const MemoryPanel: React.FC<MemoryPanelProps> = ({
  memories,
  onSaveMemory,
  onDeleteMemory,
}) => {
  const [filter, setFilter] = useState<'all' | MemoryCategory>('all');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<MemoryCategory>('preference');
  const [keyInput, setKeyInput] = useState('');
  const [valueInput, setValueInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return memories.filter((m) => {
      if (filter !== 'all' && m.category !== filter) return false;
      if (
        search.trim() &&
        !`${m.key} ${m.value}`.toLowerCase().includes(search.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [memories, filter, search]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!keyInput.trim() || !valueInput.trim()) return;
    const res = await onSaveMemory(category, keyInput.trim(), valueInput.trim());
    if (!res.ok) {
      setErrorMsg(res.error || 'Blocked by Security Agent');
      return;
    }
    setKeyInput('');
    setValueInput('');
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-800/80 bg-[#0F172A]/85 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-800/80">
          <div>
            <h2 className="font-display text-xl font-semibold text-slate-100">
              Companion Persistent Memory
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Inspect, edit, or delete what JARVIS remembers · OTPs, passwords, and API secrets are automatically blocked
            </p>
          </div>
          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search memory…"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 pl-9 pr-3 py-2 text-xs text-slate-100 focus:border-sky-500 focus:outline-none min-h-[40px]"
            />
          </div>
        </div>

        {/* Add Memory Form */}
        <form onSubmit={handleAdd} className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-3">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as MemoryCategory)}
            className="md:col-span-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 min-h-[42px]"
          >
            <option value="preference">Preference</option>
            <option value="project">Active Project</option>
            <option value="command">Frequent Command</option>
            <option value="instruction">Instruction</option>
            <option value="task">Ongoing Task</option>
          </select>
          <input
            type="text"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="Label (e.g. Morning Routine)"
            className="md:col-span-3 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 min-h-[42px]"
          />
          <input
            type="text"
            value={valueInput}
            onChange={(e) => setValueInput(e.target.value)}
            placeholder="Detail JARVIS should remember…"
            className="md:col-span-5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 min-h-[42px]"
          />
          <button
            type="submit"
            className="md:col-span-2 inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-500 px-4 py-2 text-xs font-medium text-slate-950 hover:bg-sky-400 transition-colors min-h-[42px] whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Save Memory
          </button>
        </form>

        {errorMsg && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-2.5 text-xs text-rose-200">
            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Filter Segmented Control */}
        <div className="mt-5 flex items-center gap-1.5 overflow-x-auto pb-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilter(c.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 min-h-[36px] ${
                filter === c.id
                  ? 'bg-slate-800 text-sky-300 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Memory List */}
        <div className="mt-4 divide-y divide-slate-800/80">
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              No matching memories found.
            </p>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                className="py-4 flex items-start justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="capitalize text-sky-400 font-medium">
                      {item.category}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">
                      {new Date(item.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 className="mt-1 text-sm font-medium text-slate-100">
                    {item.key}
                  </h3>
                  <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                    {item.value}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onDeleteMemory(item.id)}
                  aria-label={`Delete ${item.key}`}
                  className="rounded-lg p-2 text-slate-500 hover:text-rose-400 hover:bg-slate-800/70 transition-colors shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};
