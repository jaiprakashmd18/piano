'use client';

import { useEffect, useRef } from 'react';
import { keyboard } from '@/lib/input/keyboard';
import { ActionId, BASE_C, labelForCode, noteOffset } from '@/lib/input/keymap';
import { chordName } from '@/lib/music/chords';
import { isBlack, midiToName } from '@/lib/music/notes';
import { currentPads } from '@/lib/input/chordControl';
import { useUi } from '@/lib/hooks';
import { useSettings } from '@/store/settings';

const ROWS: { codes: string[]; indent: number }[] = [
  { indent: 0, codes: ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'] },
  { indent: 1.5, codes: ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight'] },
  { indent: 1.9, codes: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'] },
  { indent: 2.5, codes: ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'] },
];

const SHORT: Partial<Record<ActionId, string>> = {
  'octave:down': 'Oct −', 'octave:up': 'Oct +', 'rhythm:toggle': 'Start/Stop', 'rhythm:fill': 'Fill', 'rhythm:sync': 'Sync',
  'rhythm:break': 'Break', 'rhythm:ending': 'Intro/End', 'rhythm:prevVar': 'Var −', 'rhythm:nextVar': 'Var +', 'bpm:up': 'BPM +',
  'bpm:down': 'BPM −', tap: 'Tap', sustain: 'Sustain', panic: 'Stop all', 'chordmod:flip': 'maj/min', 'chordmod:7': '7th',
  'chordmod:sus4': 'sus4', 'chordmod:dim': 'dim', 'chordmod:reset': 'plain',
};

/** A picture of the laptop keyboard showing what every key does; keys light up as they are pressed. */
export function KeyLegend({ showChords = false }: { showChords?: boolean }) {
  const mapping = useSettings((s) => s.mapping);
  const octaveShift = useSettings((s) => s.octaveShift);
  const transpose = useSettings((s) => s.transpose);
  useSettings((s) => `${s.keyTonic}${s.keyMode}`);
  const layout = useUi((s) => s.layout);
  const caps = useRef(new Map<string, HTMLElement>());

  useEffect(
    () =>
      keyboard.onKey((code, down) => {
        caps.current.get(code)?.classList.toggle('!border-accent', down);
        caps.current.get(code)?.classList.toggle('!bg-accent/30', down);
      }),
    [],
  );

  const pads = currentPads();
  const cap = (code: string, wide = false) => {
    const action = mapping[code];
    const off = noteOffset(action);
    let caption = '';
    let tone = 'border-white/5 bg-ink-900/60 text-zinc-600';
    if (off !== null) {
      const midi = BASE_C + octaveShift * 12 + off + transpose;
      caption = midiToName(midi);
      tone = isBlack(midi) ? 'border-zinc-500/40 bg-zinc-900 text-zinc-200' : 'border-zinc-300/40 bg-zinc-200/90 text-zinc-900';
    } else if (action?.startsWith('chord:')) {
      const c = pads[Number(action.slice(6))];
      caption = c ? chordName(c) : '';
      tone = showChords ? 'border-left/50 bg-left/15 text-purple-100' : 'border-white/10 bg-ink-800 text-zinc-500';
    } else if (action) {
      caption = SHORT[action] ?? '';
      tone = 'border-right/40 bg-right/10 text-sky-100';
    }
    return (
      <div
        key={code}
        ref={(el) => {
          if (el) caps.current.set(code, el);
          else caps.current.delete(code);
        }}
        className={`flex h-11 flex-col items-center justify-center rounded-md border text-center transition-colors duration-75 ${wide ? 'flex-[6]' : 'flex-1'} ${tone}`}
      >
        <span className="font-mono text-[11px] font-bold leading-none">{labelForCode(code, layout)}</span>
        <span className="mt-1 text-[9px] leading-none opacity-80">{caption}</span>
      </div>
    );
  };

  return (
    <div className="panel p-4" aria-label="Laptop keyboard map">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="panel-title">Your laptop keyboard</span>
        <span className="chip"><span className="mr-1.5 h-2 w-2 rounded-sm bg-zinc-200" />white keys</span>
        <span className="chip"><span className="mr-1.5 h-2 w-2 rounded-sm bg-zinc-800 ring-1 ring-zinc-500" />black keys</span>
        <span className="chip"><span className="mr-1.5 h-2 w-2 rounded-sm bg-right/60" />controls</span>
        {showChords && <span className="chip"><span className="mr-1.5 h-2 w-2 rounded-sm bg-left/60" />chords</span>}
      </div>
      <div className="mx-auto flex max-w-3xl flex-col gap-1">
        {ROWS.map((row, i) => (
          <div key={i} className="flex gap-1" style={{ paddingLeft: `${row.indent}rem`, paddingRight: `${Math.max(0, 2.5 - row.indent)}rem` }}>
            {row.codes.map((c) => cap(c))}
          </div>
        ))}
        <div className="flex gap-1 px-10">
          {cap('ShiftLeft')}
          {cap('Space', true)}
          {cap('Enter')}
          {cap('ArrowUp')}
          {cap('ArrowDown')}
          {cap('Escape')}
        </div>
      </div>
    </div>
  );
}
