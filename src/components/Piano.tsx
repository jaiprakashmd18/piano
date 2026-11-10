'use client';

import { memo, useEffect, useMemo, useRef } from 'react';
import { engine } from '@/lib/audio/engine';
import { codeForMidi, labelForCode } from '@/lib/input/keymap';
import { keyboardGeometry, midiToName, pitchClass } from '@/lib/music/notes';
import { useUi } from '@/lib/hooks';
import { useSettings } from '@/store/settings';

interface PianoProps {
  low: number;
  high: number;
  /** Height in px. */
  height?: number;
  /** Keys to pulse as "press this now". */
  hints?: number[];
  className?: string;
}

/**
 * The on-screen piano. Key highlights are driven straight from audio-engine
 * events by toggling classes on DOM nodes, so playing never re-renders React.
 */
function PianoImpl({ low, high, height = 180, hints, className }: PianoProps) {
  const mapping = useSettings((s) => s.mapping);
  const octaveShift = useSettings((s) => s.octaveShift);
  const transpose = useSettings((s) => s.transpose);
  const showKeyLabels = useSettings((s) => s.showKeyLabels);
  const showNoteNames = useSettings((s) => s.showNoteNames);
  const layout = useUi((s) => s.layout);
  const root = useRef<HTMLDivElement>(null);
  const els = useRef(new Map<number, HTMLDivElement>());
  const counts = useRef(new Map<number, { user: number; auto: number }>());
  const pointers = useRef(new Map<number, number>());

  const { keys, whiteCount } = useMemo(() => keyboardGeometry(low, high), [low, high]);

  useEffect(() => {
    const paint = (midi: number) => {
      const el = els.current.get(midi);
      const c = counts.current.get(midi);
      if (!el) return;
      el.classList.toggle('on', Boolean(c && c.user + c.auto > 0));
      el.classList.toggle('auto', Boolean(c && c.user === 0 && c.auto > 0));
    };
    const offNote = engine.notes.on((e) => {
      const c = counts.current.get(e.midi) ?? { user: 0, auto: 0 };
      const k = e.source === 'user' ? 'user' : 'auto';
      c[k] = Math.max(0, c[k] + (e.type === 'on' ? 1 : -1));
      counts.current.set(e.midi, c);
      paint(e.midi);
    });
    const offClear = engine.cleared.on(() => {
      const all = [...counts.current.keys()];
      counts.current.clear();
      all.forEach(paint);
    });
    return () => {
      offNote();
      offClear();
    };
  }, []);

  // Pointer / touch playing with glissando: each pointer owns at most one note.
  const midiAt = (x: number, y: number): { midi: number; velocity: number } | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const key = el?.closest<HTMLElement>('[data-midi]');
    if (!key || !root.current?.contains(key)) return null;
    const r = key.getBoundingClientRect();
    // Lower on the key = louder, like the leverage of a real key.
    const depth = Math.max(0, Math.min(1, (y - r.top) / r.height));
    return { midi: Number(key.dataset.midi), velocity: 0.45 + 0.5 * depth };
  };

  const release = (id: number) => {
    const m = pointers.current.get(id);
    if (m !== undefined) engine.noteOff(m);
    pointers.current.delete(id);
  };

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (!engine.ready) {
      void engine.start().catch(() => {});
      return;
    }
    const hit = midiAt(e.clientX, e.clientY);
    if (!hit) return;
    root.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, hit.midi);
    engine.noteOn(hit.midi, hit.velocity);
  };
  const onMove = (e: React.PointerEvent) => {
    const current = pointers.current.get(e.pointerId);
    if (current === undefined) return;
    const hit = midiAt(e.clientX, e.clientY);
    if (!hit || hit.midi === current) return;
    engine.noteOff(current);
    pointers.current.set(e.pointerId, hit.midi);
    engine.noteOn(hit.midi, hit.velocity);
  };
  const onUp = (e: React.PointerEvent) => release(e.pointerId);

  useEffect(() => {
    const p = pointers.current;
    return () => {
      for (const m of p.values()) engine.noteOff(m);
      p.clear();
    };
  }, []);

  const hintSet = useMemo(() => new Set(hints ?? []), [hints]);
  const whiteW = 100 / whiteCount;
  const compact = whiteCount > 36;

  return (
    <div
      ref={root}
      className={`piano ${className ?? ''}`}
      style={{ height }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}
      role="group"
      aria-label="Piano keyboard"
    >
      {keys.map((k) => {
        const code = codeForMidi(mapping, k.midi - transpose, octaveShift);
        const label = code ? labelForCode(code, layout) : '';
        const isC = pitchClass(k.midi) === 0;
        return (
          <div
            key={k.midi}
            ref={(el) => {
              if (el) els.current.set(k.midi, el);
              else els.current.delete(k.midi);
            }}
            data-midi={k.midi}
            className={`pkey ${k.black ? 'black' : 'white'} ${code ? '' : 'unmapped'} ${hintSet.has(k.midi) ? 'hint' : ''}`}
            style={{ left: `${k.x * whiteW}%`, width: `${k.w * whiteW}%` }}
            aria-label={midiToName(k.midi)}
          >
            {showKeyLabels && label && <span className="klabel">{label}</span>}
            {showNoteNames && !k.black && (!compact || isC || label) && <span className="nlabel">{midiToName(k.midi)}</span>}
          </div>
        );
      })}
    </div>
  );
}

export const Piano = memo(PianoImpl);
