'use client';

import { useEffect, useMemo, useState } from 'react';
import { Slider } from '@/components/ControlBar';
import { engine } from '@/lib/audio/engine';
import { CREDITS } from '@/lib/audio/instruments';
import { ACTION_LABELS, ActionId, BASE_C, CONTROL_ACTIONS, MAPPING_PRESETS, RESERVED_CODES, codesForAction, labelForCode, mappedOffsets } from '@/lib/input/keymap';
import { midiToName } from '@/lib/music/notes';
import { useEngineStatus, useUi } from '@/lib/hooks';
import { useSettings } from '@/store/settings';

function RolloverTester() {
  const layout = useUi((s) => s.layout);
  const [held, setHeld] = useState<string[]>([]);
  const [max, setMax] = useState(0);
  useEffect(() => {
    const down = new Set<string>();
    const sync = () => {
      setHeld([...down]);
      setMax((m) => Math.max(m, down.size));
    };
    const kd = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || e.code === 'Tab') return;
      down.add(e.code);
      sync();
    };
    const ku = (e: KeyboardEvent) => {
      down.delete(e.code);
      sync();
    };
    const clear = () => {
      down.clear();
      sync();
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', clear);
    };
  }, []);
  return (
    <section className="panel p-5" aria-label="Keyboard rollover test">
      <h2 className="text-base font-semibold text-zinc-100">How many keys can your keyboard register at once?</h2>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-zinc-400">
        Many laptop keyboards cannot detect certain combinations of three or more keys (this is called ghosting, and it is a hardware limit that no website can remove).
        Hold the chord shapes you want to play, for example <span className="kbd">A</span> <span className="kbd">D</span> <span className="kbd">G</span>, and check that every key shows up here.
        If one is missing, try the same chord in a different octave or use the chord-simplify option on the Learn page.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="flex min-h-[2.5rem] min-w-[14rem] flex-1 flex-wrap items-center gap-1.5 rounded-lg border border-white/10 bg-ink-900 p-2" data-testid="held-keys">
          {held.length === 0 ? <span className="text-xs text-zinc-500">Hold some keys…</span> : held.map((c) => <span key={c} className="kbd">{labelForCode(c, layout)}</span>)}
        </div>
        <div className="text-sm text-zinc-300">Now: <span className="font-mono text-lg text-accent-soft">{held.length}</span></div>
        <div className="text-sm text-zinc-300">Most at once: <span className="font-mono text-lg text-accent-soft" data-testid="max-keys">{max}</span></div>
        <button className="btn btn-sm" onClick={() => setMax(0)}>Reset</button>
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const s = useSettings();
  const layout = useUi((u) => u.layout);
  const status = useEngineStatus();
  const [capturing, setCapturing] = useState<ActionId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newOffset, setNewOffset] = useState(18);

  // Capture the next key press for the action being re-bound.
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape' && capturing !== 'panic') return setCapturing(null);
      if (RESERVED_CODES.has(e.code) || e.code === 'Tab') return setNotice(`${labelForCode(e.code, layout)} is reserved by the browser or system. Choose another key.`);
      const st = useSettings.getState();
      const previous = st.mapping[e.code];
      // Notes and chords may have one key each; replace the old binding.
      for (const code of codesForAction(st.mapping, capturing)) st.bindKey(code, null);
      st.bindKey(e.code, capturing);
      setNotice(previous && previous !== capturing ? `${labelForCode(e.code, layout)} was moved from “${describe(previous)}”.` : null);
      setCapturing(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, layout]);

  const offsets = useMemo(() => mappedOffsets(s.mapping), [s.mapping]);
  const latency = status === 'ready' ? engine.latencyMs() : null;

  const row = (action: ActionId, label: string) => {
    const codes = codesForAction(s.mapping, action);
    return (
      <div key={action} className="flex items-center gap-2 border-b border-white/5 py-1.5">
        <span className="flex-1 truncate text-sm text-zinc-300">{label}</span>
        <span className="flex gap-1">{codes.length ? codes.map((c) => <span key={c} className="kbd">{labelForCode(c, layout)}</span>) : <span className="text-xs text-zinc-600">not set</span>}</span>
        <button className={`btn btn-sm ${capturing === action ? 'btn-on' : ''}`} onClick={() => { setNotice(null); setCapturing(capturing === action ? null : action); }}>
          {capturing === action ? 'Press a key…' : 'Change'}
        </button>
        <button className="btn btn-sm" disabled={codes.length === 0} aria-label={`Clear ${label}`} onClick={() => codes.forEach((c) => s.bindKey(c, null))}>✕</button>
      </div>
    );
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-3 p-3 sm:gap-4 sm:p-4 lg:p-6 2xl:max-w-7xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Settings</h1>
        <p className="text-sm text-zinc-400">Everything is stored in this browser. No account is needed.</p>
      </header>

      <section className="panel p-5" aria-label="Keyboard layout">
        <h2 className="text-base font-semibold text-zinc-100">Laptop keyboard layout</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {MAPPING_PRESETS.map((p) => (
            <button key={p.id} data-testid={`preset-${p.id}`} className={`rounded-xl border p-4 text-left transition ${s.presetId === p.id ? 'border-accent/60 bg-accent/5' : 'border-white/10 hover:border-white/25'}`} onClick={() => s.applyPreset(p.id)}>
              <span className="text-sm font-semibold text-zinc-100">{p.name}</span>
              <span className="mt-1 block text-xs leading-relaxed text-zinc-400">{p.description}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-zinc-500">
          {s.presetId === 'custom' ? 'You are using a customised layout. ' : ''}
          Keys are matched by their physical position, so the piano shape is the same on QWERTY, AZERTY, QWERTZ and other layouts.
          {layout ? ' The letters shown throughout the app were read from your actual keyboard layout.' : ' Your browser does not expose the keyboard layout, so US key legends are shown; positions still match.'}
        </p>
        {notice && <p role="status" className="mt-2 text-sm text-accent-soft">{notice}</p>}

        <div className="mt-4 grid gap-x-8 gap-y-4 lg:grid-cols-2">
          <div>
            <h3 className="panel-title mb-1">Piano keys (shown at octave 0)</h3>
            {offsets.map((o) => row(`note:${o}`, `${midiToName(BASE_C + o)}`))}
            <div className="mt-2 flex items-center gap-2">
              <select aria-label="Note to add" className="field" value={newOffset} onChange={(e) => setNewOffset(Number(e.target.value))}>
                {Array.from({ length: 49 }, (_, i) => i - 24).filter((o) => !offsets.includes(o)).map((o) => <option key={o} value={o}>{midiToName(BASE_C + o)}</option>)}
              </select>
              <button className="btn btn-sm" onClick={() => setCapturing(`note:${newOffset}`)}>{capturing === `note:${newOffset}` ? 'Press a key…' : 'Add a key for this note'}</button>
            </div>
          </div>
          <div>
            <h3 className="panel-title mb-1">Controls</h3>
            {CONTROL_ACTIONS.map((a) => row(a, ACTION_LABELS[a]))}
            <h3 className="panel-title mb-1 mt-4">Chord pads</h3>
            {Array.from({ length: 10 }, (_, i) => row(`chord:${i}`, `Chord pad ${i + 1}`))}
          </div>
        </div>
      </section>

      <section className="panel grid gap-6 p-5 md:grid-cols-2" aria-label="Playing">
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-semibold text-zinc-100">Playing feel</h2>
          <Slider label="Key velocity" value={s.velocity} min={0.1} onChange={(v) => s.set({ velocity: v })} format={(v) => String(Math.round(v * 127))} />
          <p className="-mt-2 text-xs text-zinc-500">Laptop keys cannot sense how hard you press, so every note uses this strength. With the mouse or touch, pressing lower on a key plays louder.</p>
          <div>
            <div className="panel-title mb-1.5">Sustain key behaviour</div>
            <div className="flex gap-1.5">
              <button className={`btn btn-sm ${s.sustainMode === 'hold' ? 'btn-on' : ''}`} onClick={() => s.set({ sustainMode: 'hold' })}>Hold to sustain</button>
              <button className={`btn btn-sm ${s.sustainMode === 'toggle' ? 'btn-on' : ''}`} onClick={() => s.set({ sustainMode: 'toggle' })}>Press to latch</button>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              Windows may offer “Sticky Keys” if Shift is tapped five times quickly. Decline it (or turn the shortcut off in Windows Accessibility settings), or bind sustain to another key above.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-zinc-100">Display</h2>
          <label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={s.showKeyLabels} onChange={(e) => s.set({ showKeyLabels: e.target.checked })} /> Show laptop key letters on the piano</label>
          <label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={s.showNoteNames} onChange={(e) => s.set({ showNoteNames: e.target.checked })} /> Show note names</label>
          <h2 className="mt-3 text-base font-semibold text-zinc-100">Audio</h2>
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-zinc-500">Engine</dt><dd className="text-zinc-200" data-testid="audio-status">{status}</dd>
            <dt className="text-zinc-500">Sample rate</dt><dd className="text-zinc-200">{status === 'ready' ? `${engine.sampleRate()} Hz` : '–'}</dd>
            <dt className="text-zinc-500">Processing latency</dt><dd className="text-zinc-200">{latency ? `${latency.base} ms` : '–'}</dd>
            <dt className="text-zinc-500">Output latency</dt><dd className="text-zinc-200">{latency ? (latency.output ? `${latency.output} ms` : 'not reported') : '–'}</dd>
          </dl>
          {status !== 'ready' && <button className="btn btn-sm w-fit" onClick={() => void engine.start().catch(() => {})}>Start audio to measure</button>}
          <p className="text-xs leading-relaxed text-zinc-500">
            Notes are triggered immediately with no scheduling delay, but the browser and sound hardware always add a few milliseconds.
            Wired headphones or built-in speakers respond fastest; Bluetooth audio typically adds 100 to 250 ms and makes playing feel late.
          </p>
        </div>
      </section>

      <RolloverTester />

      <section className="panel p-5" aria-label="Credits">
        <h2 className="text-base font-semibold text-zinc-100">Sound credits and licences</h2>
        <ul className="mt-3 space-y-2 text-sm text-zinc-300">
          {CREDITS.map((c) => (
            <li key={c.name}>
              <span className="font-medium text-zinc-100">{c.name}</span> by {c.by}. <span className="text-zinc-400">{c.license}.</span>{' '}
              {c.url && <a className="text-accent-soft underline" href={c.url} target="_blank" rel="noreferrer">Source</a>}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-zinc-500">Rhythm patterns and built-in song arrangements are original to this project or based on public-domain melodies.</p>
      </section>

      <section className="panel flex flex-wrap items-center gap-3 p-5" aria-label="Reset">
        <button
          className="btn btn-danger btn-sm"
          onClick={() => {
            if (!confirm('Reset all settings and key bindings to their defaults? Saved songs and recordings are kept.')) return;
            localStorage.removeItem('aurora-keys-settings');
            location.reload();
          }}
        >
          Reset settings to defaults
        </button>
        <span className="text-xs text-zinc-500">Imported songs, recordings and scores are stored in this browser&apos;s IndexedDB and are not affected.</span>
      </section>
    </div>
  );
}

function describe(action: ActionId): string {
  if (action.startsWith('note:')) return midiToName(BASE_C + Number(action.slice(5)));
  if (action.startsWith('chord:')) return `Chord pad ${Number(action.slice(6)) + 1}`;
  return ACTION_LABELS[action] ?? action;
}
