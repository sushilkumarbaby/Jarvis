import React, { useEffect, useRef } from 'react';
import type { VoiceOrbState } from '../types/jarvis';

interface AcousticOrbProps {
  state: VoiceOrbState;
  audioLevel: number;
  compact?: boolean;
  onClick?: () => void;
}

const STATE_LABELS: Record<VoiceOrbState, string> = {
  idle: 'Standby',
  listening: 'Sun raha hoon',
  thinking: 'Soch raha hoon',
  speaking: 'Bol raha hoon',
  executing: 'Task executing',
};

const STATE_ACCENT: Record<VoiceOrbState, string> = {
  idle: '#38BDF8',
  listening: '#0EA5E9',
  thinking: '#F59E0B',
  speaking: '#22C55E',
  executing: '#A855F7',
};

export const AcousticOrb: React.FC<AcousticOrbProps> = ({
  state,
  audioLevel,
  compact = false,
  onClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef(state);
  const levelRef = useRef(audioLevel);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    levelRef.current = audioLevel;
  }, [audioLevel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frameId = 0;
    let phase = 0;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
      }

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const minDim = Math.min(w, h);
      const baseR = minDim * 0.27;
      const curState = stateRef.current;
      const level = Math.min(1, Math.max(0, levelRef.current));
      const accent = STATE_ACCENT[curState];

      ctx.clearRect(0, 0, w, h);

      if (!prefersReducedMotion) {
        phase += curState === 'idle' ? 0.018 : 0.055;
      }

      // Soft ambient halo
      const haloGrad = ctx.createRadialGradient(cx, cy, baseR * 0.3, cx, cy, baseR * (1.7 + level * 0.45));
      haloGrad.addColorStop(0, `${accent}30`);
      haloGrad.addColorStop(0.6, `${accent}10`);
      haloGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR * 2, 0, Math.PI * 2);
      ctx.fill();

      // Outer segmented ring
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(phase * 0.45);
      ctx.strokeStyle = `${accent}55`;
      ctx.lineWidth = 2 * dpr;
      ctx.setLineDash([18 * dpr, 10 * dpr]);
      ctx.beginPath();
      ctx.arc(0, 0, baseR * 1.32, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Circular audio waveform bars (48 radial bars)
      const bars = 48;
      for (let i = 0; i < bars; i++) {
        const angle = (i / bars) * Math.PI * 2 + phase * 0.25;
        const harmonic =
          curState === 'idle'
            ? 0.05 + 0.04 * Math.sin(phase * 2 + i * 0.5)
            : 0.14 +
              level * 0.65 * Math.abs(Math.sin(phase * 3 + i * 0.45)) +
              0.12 * Math.cos(phase * 2.2 - i * 0.7);
        const rInner = baseR * 0.94;
        const rOuter = rInner + minDim * 0.11 * harmonic;

        ctx.strokeStyle = i % 3 === 0 ? '#E0F2FE' : accent;
        ctx.lineWidth = (compact ? 2 : 2.6) * dpr;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * rInner, cy + Math.sin(angle) * rInner);
        ctx.lineTo(cx + Math.cos(angle) * rOuter, cy + Math.sin(angle) * rOuter);
        ctx.stroke();
      }

      // Core circle
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2.5 * dpr;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR * (0.82 + level * 0.08), 0, Math.PI * 2);
      ctx.stroke();

      frameId = requestAnimationFrame(draw);
    };

    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, [compact]);

  const sizeClass = compact ? 'w-44 h-44' : 'w-64 h-64 sm:w-72 sm:h-72';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`JARVIS Voice Orb (${STATE_LABELS[state]})`}
      className={`relative ${sizeClass} mx-auto flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 cursor-pointer group`}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      <div className="relative z-10 flex flex-col items-center text-center px-3">
        <span className="font-display text-lg sm:text-xl font-semibold tracking-wide text-slate-50">
          JARVIS
        </span>
        <span className="mt-1 text-xs font-medium text-sky-300">
          {STATE_LABELS[state]}
        </span>
      </div>
    </button>
  );
};
