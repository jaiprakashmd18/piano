'use client';

import { useEffect, useRef } from 'react';
import type { TargetState } from '@/lib/learn/evaluator';
import type { Hand } from '@/lib/learn/types';
import { isBlack, keyboardGeometry, pitchClass } from '@/lib/music/notes';

export interface LaneNote {
  id: number;
  /** Pitch column the note falls onto. */
  midi: number;
  time: number;
  duration: number;
  hand: Hand;
  /** The learner plays it (true) or the app does (false). */
  target: boolean;
  /** Laptop key legend, e.g. "A". */
  key: string;
  /** Musical name, e.g. "C4". */
  name: string;
  folded: boolean;
}

export interface LaneCue {
  time: number;
  text: string;
}

interface Props {
  notes: LaneNote[];
  cues: LaneCue[];
  low: number;
  high: number;
  /** Any CSS height. */
  height: number | string;
  /** Pixels per second of song time (zoom). */
  pps: number;
  /** Song clock; read every animation frame. */
  getTime: () => number;
  getState: (id: number) => TargetState;
  /** Seconds per beat and beats per bar for the grid. */
  beat: number;
  barBeats: number;
  /** Challenge mode: notes only appear just before they must be played, without key letters. */
  challenge: boolean;
  loop: { from: number; to: number } | null;
  /** Timestamp (performance.now) of the last wrong key, for the red flash. */
  wrongAt: React.RefObject<number>;
  showNames: boolean;
}

const COLORS = {
  right: ['#4cc9f0', '#1b8fb3'],
  left: ['#b794f6', '#7c4fd0'],
  hit: ['#4ade80', '#1f9d55'],
  missed: ['#f87171', '#b53a3a'],
  auto: ['#5b6472', '#3a4350'],
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * The falling-note lane. It is a pure function of the song clock, redrawn on
 * every animation frame, so it can never drift away from the audio.
 */
export function FallingNotes(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const p = latest.current;
      const t = p.getTime();
      const { keys, whiteCount } = keyboardGeometry(p.low, p.high);
      const unit = width / whiteCount;
      const geo = new Map(keys.map((k) => [k.midi, k]));
      const yOf = (time: number) => height - (time - t) * p.pps;

      ctx.clearRect(0, 0, width, height);
      const bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, '#0a0c10');
      bg.addColorStop(1, '#11141a');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      // Column guides: black-key lanes shaded, octave boundaries marked.
      for (const k of keys) {
        if (k.black) {
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          ctx.fillRect(k.x * unit, 0, k.w * unit, height);
        } else if (pitchClass(k.midi) === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.07)';
          ctx.fillRect(k.x * unit, 0, 1, height);
        }
      }

      // Beat and bar lines.
      if (p.beat > 0) {
        const span = height / p.pps;
        const first = Math.floor(t / p.beat);
        for (let b = first; b * p.beat < t + span; b++) {
          if (b < 0) continue;
          const y = yOf(b * p.beat);
          const bar = b % p.barBeats === 0;
          ctx.fillStyle = bar ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.04)';
          ctx.fillRect(0, Math.round(y), width, 1);
          if (bar) {
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '10px ui-monospace, monospace';
            ctx.textAlign = 'left';
            ctx.fillText(String(b / p.barBeats + 1), 4, y - 3);
          }
        }
      }

      if (p.loop) {
        const y1 = yOf(p.loop.from);
        const y2 = yOf(p.loop.to);
        ctx.fillStyle = 'rgba(245,181,68,0.06)';
        ctx.fillRect(0, y2, width, y1 - y2);
        ctx.fillStyle = 'rgba(245,181,68,0.7)';
        ctx.fillRect(0, y1, width, 1.5);
        ctx.fillRect(0, y2, width, 1.5);
      }

      const visibleSpan = p.challenge ? Math.min(height / p.pps, 0.9) : height / p.pps;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const n of p.notes) {
        if (n.time > t + visibleSpan) break;
        if (n.time + n.duration < t - 0.6) continue;
        const k = geo.get(n.midi);
        if (!k) continue;
        const state = n.target ? p.getState(n.id) : 'pending';
        if (p.challenge && !n.target) continue;
        const yBottom = yOf(n.time);
        const h = Math.max(8, n.duration * p.pps - 2);
        const x = k.x * unit + 1.5;
        const w = k.w * unit - 3;
        const y = yBottom - h;
        let pair = n.target ? COLORS[n.hand] : COLORS.auto;
        if (state === 'missed') pair = COLORS.missed;
        else if (state !== 'pending') pair = COLORS.hit;
        const g = ctx.createLinearGradient(0, y, 0, yBottom);
        g.addColorStop(0, pair[1]);
        g.addColorStop(1, pair[0]);
        ctx.globalAlpha = n.target ? (state === 'pending' ? 1 : 0.75) : 0.5;
        ctx.fillStyle = g;
        if (state !== 'pending' && state !== 'missed') {
          ctx.shadowColor = '#4ade80';
          ctx.shadowBlur = 14;
        }
        roundRect(ctx, x, y, w, h, 5);
        ctx.fill();
        ctx.shadowBlur = 0;
        if (n.folded && n.target) {
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.globalAlpha = 1;

        if (n.target && !p.challenge && yBottom > 14 && y < height - 6) {
          const cx = x + w / 2;
          const badgeY = Math.min(yBottom - 11, height - 11);
          const bw = Math.max(16, Math.min(26, w));
          ctx.fillStyle = 'rgba(8,9,12,0.82)';
          roundRect(ctx, cx - bw / 2, badgeY - 9, bw, 18, 4);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = '700 12px ui-monospace, Menlo, Consolas, monospace';
          ctx.fillText(n.key, cx, badgeY + 0.5);
          if (p.showNames && unit >= 22) {
            ctx.fillStyle = isBlack(n.midi) ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.9)';
            ctx.font = '600 9px ui-sans-serif, system-ui, sans-serif';
            ctx.fillText(n.name, cx, badgeY - 16);
          }
        }
      }

      // Octave-change cues.
      ctx.textAlign = 'right';
      for (const c of p.cues) {
        const y = yOf(c.time);
        if (y < -10 || y > height + 10) continue;
        ctx.fillStyle = 'rgba(245,181,68,0.85)';
        ctx.fillRect(0, y, width, 1);
        ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
        const tw = ctx.measureText(c.text).width + 12;
        roundRect(ctx, width - tw - 6, y - 20, tw, 18, 4);
        ctx.fill();
        ctx.fillStyle = '#0c0e12';
        ctx.fillText(c.text, width - 12, y - 10);
      }

      // The play line: notes are due when their lower edge touches it.
      const flash = Math.max(0, 1 - (performance.now() - (p.wrongAt.current ?? 0)) / 260);
      const line = ctx.createLinearGradient(0, height - 26, 0, height);
      line.addColorStop(0, 'rgba(245,181,68,0)');
      line.addColorStop(1, flash > 0 ? `rgba(248,113,113,${0.25 + 0.5 * flash})` : 'rgba(245,181,68,0.28)');
      ctx.fillStyle = line;
      ctx.fillRect(0, height - 26, width, 26);
      ctx.fillStyle = flash > 0 ? '#f87171' : '#f5b544';
      ctx.fillRect(0, height - 2, width, 2);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="block w-full rounded-t-lg" style={{ height: props.height }} aria-label="Falling notes" role="img" />;
}
