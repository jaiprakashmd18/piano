'use client';

import { useEffect, useState } from 'react';
import { arranger } from '@/lib/audio/arranger';
import { engine } from '@/lib/audio/engine';
import { INSTRUMENTS, instrumentById } from '@/lib/audio/instruments';
import { codesForAction, labelForCode } from '@/lib/input/keymap';
import { useArranger, useUi } from '@/lib/hooks';
import { OCTAVE_MAX, OCTAVE_MIN, useSettings } from '@/store/settings';
import { toggleFullscreen } from './AppShell';

export function Slider({ label, value, onChange, min = 0, max = 1, step = 0.01, format }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; format?: (v: number) => string;
}) {
  return (
    <label className="flex min-w-[7.5rem] flex-1 flex-col gap-1.5">
      <span className="flex items-baseline justify-between">
        <span className="panel-title">{label}</span>
        <span className="font-mono text-[11px] text-zinc-400">{format ? format(value) : Math.round(value * 100)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
    </label>
  );
}

export function Stepper({ label, value, onChange, min, max, hint }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="panel-title">{label}</span>
      <div className="flex items-center gap-1">
        <button className="btn btn-sm w-8" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`${label} down`}>−</button>
        <span className="w-9 text-center font-mono text-sm text-zinc-100" aria-live="polite">{value > 0 ? `+${value}` : value}</span>
        <button className="btn btn-sm w-8" onClick={() => onChange(Math.min(max, value + 1))} aria-label={`${label} up`}>+</button>
        {hint && <span className="ml-1 text-[11px] text-zinc-500">{hint}</span>}
      </div>
    </div>
  );
}

export function InstrumentSelect({ className }: { className?: string }) {
  const id = useSettings((s) => s.instrumentId);
  const groups = [...new Set(INSTRUMENTS.map((i) => i.category))];
  return (
    <select
      aria-label="Instrument"
      className={`field ${className ?? ''}`}
      value={id}
      onChange={(e) => {
        const def = instrumentById(e.target.value);
        // Each instrument carries its own effect preset; the sliders stay adjustable afterwards.
        useSettings.getState().set({ instrumentId: def.id, reverb: def.reverb, chorus: def.chorus });
        e.target.blur();
      }}
    >
      {groups.map((g) => (
        <optgroup key={g} label={g}>
          {INSTRUMENTS.filter((i) => i.category === g).map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function SustainLamp() {
  const [on, setOn] = useState(false);
  const mapping = useSettings((s) => s.mapping);
  const mode = useSettings((s) => s.sustainMode);
  const layout = useUi((s) => s.layout);
  useEffect(() => engine.pedalChanged.on(setOn), []);
  const key = codesForAction(mapping, 'sustain')[0];
  return (
    <div className="flex flex-col gap-1.5">
      <span className="panel-title">Sustain</span>
      <button
        className={`btn btn-sm ${on ? 'btn-on' : ''}`}
        aria-pressed={on}
        onClick={() => engine.setSustain(!engine.sustainOn)}
        title={mode === 'hold' ? 'Hold the sustain key while playing' : 'Press the sustain key to latch'}
      >
        Pedal {on ? 'down' : 'up'} {key && <span className="kbd ml-1">{labelForCode(key, layout)}</span>}
      </button>
    </div>
  );
}

/** Instrument, mix and performance controls shared by the playing pages. */
export function ControlBar({ showMetronome = true }: { showMetronome?: boolean }) {
  const s = useSettings();
  const arr = useArranger();
  const fullscreen = useUi((u) => u.fullscreen);
  const def = instrumentById(s.instrumentId);
  return (
    <div className="panel flex flex-wrap items-end gap-x-6 gap-y-4 p-4">
      <div className="flex min-w-[13rem] flex-col gap-1.5">
        <span className="panel-title">Instrument</span>
        <InstrumentSelect />
      </div>
      <Slider label="Volume" value={s.masterVolume} onChange={(v) => s.set({ masterVolume: v })} />
      <Slider label="Reverb" value={s.reverb} onChange={(v) => s.set({ reverb: v })} />
      <Slider label="Chorus" value={s.chorus} onChange={(v) => s.set({ chorus: v })} />
      <Slider label="Velocity" value={s.velocity} min={0.1} onChange={(v) => s.set({ velocity: v })} format={(v) => String(Math.round(v * 127))} />
      <Stepper label="Octave" value={s.octaveShift} min={OCTAVE_MIN} max={OCTAVE_MAX} onChange={(v) => s.set({ octaveShift: v })} />
      <Stepper label="Transpose" value={s.transpose} min={-12} max={12} onChange={(v) => s.set({ transpose: v })} />
      <SustainLamp />
      {showMetronome && (
        <div className="flex flex-col gap-1.5">
          <span className="panel-title">Metronome · {arr.bpm} BPM</span>
          <div className="flex items-center gap-1">
            <button className={`btn btn-sm ${arr.metronome ? 'btn-on' : ''}`} aria-pressed={arr.metronome} onClick={() => arranger.setMetronome(!arr.metronome)} disabled={!engine.ready}>
              {arr.metronome ? 'On' : 'Off'}
            </button>
            <button className="btn btn-sm w-8" onClick={() => arranger.nudgeBpm(-2)} aria-label="Tempo down">−</button>
            <button className="btn btn-sm w-8" onClick={() => arranger.nudgeBpm(2)} aria-label="Tempo up">+</button>
          </div>
        </div>
      )}
      <div className="ml-auto flex flex-col gap-1.5">
        <span className="panel-title">View</span>
        <div className="flex gap-1">
          <button className="btn btn-sm" onClick={toggleFullscreen}>{fullscreen ? 'Exit full screen' : 'Full screen'}</button>
          <button className="btn btn-sm btn-danger" onClick={() => { arranger.stop(); engine.panic(); }} title="Stop all sound (Esc)">Stop all</button>
        </div>
      </div>
      {def.finiteSustain && (
        <p className="basis-full text-[11px] text-zinc-500">
          {def.name} uses 3-second samples, so very long held notes fade naturally. {def.credit}.
        </p>
      )}
    </div>
  );
}
