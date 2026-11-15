import React, { useEffect, useState } from 'react';
import { Check, Copy, Download, FileCode, ShieldCheck, Smartphone } from 'lucide-react';
import type { EnvironmentInfo, JarvisSettings } from '../types/jarvis';

interface AndroidFile {
  path: string;
  size: number;
  content: string;
}

interface AndroidArchitecturePanelProps {
  environment?: EnvironmentInfo;
  settings: JarvisSettings;
  onUpdateSettings: (patch: Partial<JarvisSettings>) => void;
}

export const AndroidArchitecturePanel: React.FC<AndroidArchitecturePanelProps> = ({
  environment,
  settings,
  onUpdateSettings,
}) => {
  const [files, setFiles] = useState<AndroidFile[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/android/files')
      .then((r) => r.json())
      .then((data: { files?: AndroidFile[] }) => {
        if (data.files && data.files.length > 0) {
          setFiles(data.files);
          const preferred =
            data.files.find((f) => f.path.includes('WakeWordForegroundService.kt')) ||
            data.files[0];
          setSelectedPath(preferred.path);
        }
      })
      .catch(() => {});
  }, []);

  const activeFile = files.find((f) => f.path === selectedPath);

  const handleCopy = async () => {
    if (!activeFile) return;
    await navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="space-y-8">
      {/* Environment Audit & APK Reality Report */}
      <section className="rounded-2xl border border-slate-800/80 bg-[#0F172A]/85 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-800/80">
          <div>
            <h2 className="font-display text-xl font-semibold text-slate-100">
              Native Android Kotlin Project &amp; Environment Audit
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Full Android Studio Kotlin + Jetpack Compose + Material 3 codebase ready for `./gradlew assembleDebug`
            </p>
          </div>

          <a
            href="/api/android/download"
            download="jarvis-android-kotlin.zip"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-medium text-slate-950 hover:bg-sky-400 transition-colors min-h-[44px] whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            Download Kotlin Project (.zip)
          </a>
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs text-slate-400">Host Environment</div>
            <div className="mt-1 font-mono text-sm text-slate-100">
              {environment?.os || 'linux x64'}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs text-slate-400">Android SDK / Gradle</div>
            <div className="mt-1 font-mono text-sm text-amber-400">
              {environment?.hasAndroidSdk ? 'Available' : 'Not Installed in Sandbox'}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs text-slate-400">Kotlin Source Files</div>
            <div className="mt-1 font-mono text-sm tabular-nums text-sky-300">
              {files.length} files
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs text-slate-400">Closest Live Alternative</div>
            <div className="mt-1 font-mono text-sm text-emerald-400">
              Android PWA + Live API
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-300 leading-relaxed space-y-2">
          <p className="font-medium text-slate-100 flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-sky-400" />
            Honest Android Lock-Screen &amp; Background Microphone Engineering Notes
          </p>
          <p>
            1. <strong>Why APK isn&apos;t compiled here:</strong> This sandbox has Node.js ({environment?.nodeVersion || 'v22'}) and Python, without Java/Gradle/Android SDK. Instead of faking an APK binary, the complete native Kotlin project is packaged above for Android Studio.
          </p>
          <p>
            2. <strong>Hardware DSP vs Foreground Service:</strong> Android restricts <code>AlwaysOnHotwordDetector</code> to preloaded system-signed apps. Third-party apps use <code>WakeWordForegroundService</code> (<code>foregroundServiceType=&quot;microphone&quot;</code>) + <code>PARTIAL_WAKE_LOCK</code> + Battery Optimization exemption, processing 16kHz PCM locally without streaming idle audio to the cloud.
          </p>
          <p>
            3. <strong>Lock-Screen Security Boundary:</strong> Selecting JARVIS as Default Digital Assistant (<code>VoiceInteractionService</code> with <code>supportsLaunchVoiceAssistFromKeyguard=&quot;true&quot;</code>) allows hands-free Hindi voice conversation on the lock screen, while sensitive actions call <code>KeyguardManager.requestDismissKeyguard()</code> without bypassing PIN/biometrics.
          </p>
        </div>
      </section>

      {/* Privacy & Permission Controls */}
      <section className="rounded-2xl border border-slate-800/80 bg-[#0F172A]/85 p-6">
        <div className="pb-4 border-b border-slate-800/80 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-sky-400" />
          <h3 className="font-display text-lg font-semibold text-slate-100">
            Permissions &amp; Privacy Controls
          </h3>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              key: 'lockScreenMode' as const,
              title: 'Lock-Screen Standby Companion',
              desc: 'Keep Wake-Lock standby overlay active without bypassing device PIN/biometrics.',
            },
            {
              key: 'accessibilityBridge' as const,
              title: 'Android Accessibility Automation (Opt-In)',
              desc: 'User-enabled tap/scroll/input bridge in JarvisAccessibilityService.kt.',
            },
            {
              key: 'notifications' as const,
              title: 'Permitted Notification Alerts',
              desc: 'Allow scheduled Hindi reminders and NotificationListener summaries.',
            },
            {
              key: 'microphone' as const,
              title: 'Transparent Microphone Indicator',
              desc: 'Explicit mic permission with persistent Pause Mic notification control.',
            },
          ].map((perm) => {
            const active = settings.permissions[perm.key];
            return (
              <div
                key={perm.key}
                className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4"
              >
                <div>
                  <div className="text-sm font-medium text-slate-100">{perm.title}</div>
                  <p className="mt-1 text-xs text-slate-400">{perm.desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSettings({
                      permissions: {
                        ...settings.permissions,
                        [perm.key]: !active,
                      },
                    })
                  }
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium min-h-[36px] shrink-0 border ${
                    active
                      ? 'border-sky-500/40 bg-sky-500/15 text-sky-300'
                      : 'border-slate-700 bg-slate-800 text-slate-400'
                  }`}
                >
                  {active ? 'Allowed' : 'Disabled'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Interactive Kotlin & Gradle Source Explorer */}
      <section className="rounded-2xl border border-slate-800/80 bg-[#0F172A]/85 p-6">
        <div className="pb-4 border-b border-slate-800/80 flex items-center justify-between gap-4">
          <h3 className="font-display text-lg font-semibold text-slate-100">
            Android Kotlin Codebase Explorer
          </h3>
          {activeFile && (
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 min-h-[36px]"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy File'}
            </button>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4 max-h-[480px] overflow-y-auto space-y-1 pr-1">
            {files.map((f) => (
              <button
                key={f.path}
                type="button"
                onClick={() => setSelectedPath(f.path)}
                className={`w-full text-left rounded-lg px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors ${
                  selectedPath === f.path
                    ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                    : 'text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <span className="inline-flex items-center gap-2 truncate">
                  <FileCode className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  <span className="truncate font-mono">{f.path}</span>
                </span>
                <span className="font-mono text-[10px] text-slate-500 shrink-0 tabular-nums">
                  {(f.size / 1024).toFixed(1)} KB
                </span>
              </button>
            ))}
          </div>

          <div className="lg:col-span-8">
            <pre className="h-[480px] overflow-auto rounded-xl border border-slate-800 bg-slate-950/90 p-4 text-xs font-mono text-slate-200 leading-relaxed">
              {activeFile?.content || 'Select a Kotlin or Gradle file to inspect.'}
            </pre>
          </div>
        </div>
      </section>
    </div>
  );
};
