'use client';

import { useEffect, useState } from 'react';
import { AudioGate } from '@/components/AudioGate';
import { ControlBar, Slider } from '@/components/ControlBar';
import { KeyLegend } from '@/components/KeyLegend';
import { Piano } from '@/components/Piano';
import { BPM_MAX, BPM_MIN, arranger } from '@/lib/audio/arranger';
import { STYLES, styleById } from '@/lib/audio/styles';
import { ChordModifier, modifyChord, setChordDirect, triggerPad } from '@/lib/input/chordControl';
import { ActionId, codesForAction, labelForCode } from '@/lib/input/keymap';
import { ALL_QUALITIES, ChordQuality, QUALITY_LABEL, ROMAN_MAJOR, ROMAN_MINOR, chordName, chordPadsForKey } from '@/lib/music/chords';
import { NOTE_NAMES } from '@/lib/music/notes';
import { useArranger, useEngineStatus, usePerformanceKeys, useUi } from '@/lib/hooks';
import { useSettings } from '@/store/settings';

function Key({ action }: { action: ActionId }) {
  const mapping = useSettings((s) => s.mapping);
  const layout = useUi((s) => s.layout);
  const code = codesForAction(mapping, action)[0];
  return code ? <span className="kbd ml-1.5">{labelForCode(code, layout)}</span> : null;
}

const MODS: { id: ChordModifier; label: string; action: ActionId }[] = [
  { id: 'flip', label: 'Major ↔ minor', action: 'chordmod:flip' },
  { id: '7', label: '7th', action: 'chordmod:7' },
  { id: 'sus4', label: 'sus4', action: 'chordmod:sus4' },
  { id: 'dim', label: 'dim', action: 'chordmod:dim' },
  { id: 'reset', label: 'Plain', action: 'chordmod:reset' },
];

export default function ArrangerPage() {
  usePerformanceKeys();
  const status = useEngineStatus();
  const a = useArranger();
  const s = useSettings();
  const style = styleById(a.styleId);
  const [freeRoot, setFreeRoot] = useState(0);
  const [freeQuality, setFreeQuality] = useState<ChordQuality>('maj');

  useEffect(() => {
    if (status === 'ready') void arranger.prepare();
  }, [status]);

  const pads = chordPadsForKey(s.keyTonic, s.keyMode);
  const roman = s.keyMode === 'major' ? ROMAN_MAJOR : ROMAN_MINOR;
  const beats = style.stepsPerBar / style.stepsPerBeat;
  const ready = status === 'ready' && !a.loading;
  const groups = [...new Set(STYLES.map((x) => x.group))];
  const shownVariation = a.pendingVariation ?? a.variation;

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-4 p-4 lg:p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Arranger Keyboard</h1>
        <p className="text-sm text-zinc-400">
          Pick a rhythm, press <span className="kbd">Space</span> to start, choose chords with the number keys and play the melody on the letter keys.
        </p>
      </header>
      <AudioGate />
      {a.error && <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-100">{a.error}</div>}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        {/* Styles */}
        <section className="panel p-4" aria-label="Rhythm styles">
          <div className="mb-3 flex items-center justify-between">
            <span className="panel-title">Rhythm style</span>
            <span className="text-xs text-zinc-500">{a.loading ? 'Loading band…' : `${style.name} · ${beats}/4 feel`}</span>
          </div>
          <div className="flex flex-col gap-3">
            {groups.map((g) => (
              <div key={g}>
                <div className="mb-1.5 text-[11px] font-medium text-zinc-500">{g}</div>
                <div className="flex flex-wrap gap-1.5">
                  {STYLES.filter((x) => x.group === g).map((x) => (
                    <button key={x.id} className={`btn btn-sm ${x.id === a.styleId ? 'btn-on' : ''}`} aria-pressed={x.id === a.styleId} onClick={() => void arranger.setStyle(x.id)}>
                      {x.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Transport */}
        <section className="panel flex flex-col gap-4 p-4" aria-label="Rhythm controls">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <div className="panel-title">Tempo</div>
              <div className="mt-1 flex items-center gap-1.5">
                <button className="btn btn-sm w-8" onClick={() => arranger.nudgeBpm(-1)} aria-label="Tempo down">−</button>
                <input
                  type="number"
                  aria-label="Tempo in BPM"
                  className="field w-20 text-center font-mono text-lg font-semibold text-accent-soft"
                  min={BPM_MIN}
                  max={BPM_MAX}
                  value={a.bpm}
                  onChange={(e) => arranger.setBpm(Number(e.target.value) || a.bpm)}
                />
                <button className="btn btn-sm w-8" onClick={() => arranger.nudgeBpm(1)} aria-label="Tempo up">+</button>
                <button className="btn btn-sm" onClick={() => arranger.tapTempo()}>Tap<Key action="tap" /></button>
              </div>
            </div>
            <div>
              <div className="panel-title">Beat</div>
              <div className="mt-2.5 flex items-center gap-2" aria-hidden>
                {Array.from({ length: beats }, (_, i) => (
                  <span key={i} className={`led ${a.beat === i ? (i === 0 ? '!bg-bad shadow-[0_0_10px_#f87171]' : '!bg-good shadow-[0_0_10px_#4ade80]') : ''}`} />
                ))}
              </div>
            </div>
            <div className="ml-auto text-right">
              <div className="panel-title">Section</div>
              <div data-testid="section" className="mt-1 font-mono text-sm uppercase text-zinc-200">
                {a.syncArmed ? 'sync armed' : a.section === 'main' ? `Main ${'ABCD'[a.variation]}` : a.section}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button data-testid="start-stop" className={`btn px-5 ${a.running ? 'btn-danger' : 'btn-primary'}`} disabled={!ready} onClick={() => arranger.toggle()}>
              {a.running ? 'Stop' : 'Start'}<Key action="rhythm:toggle" />
            </button>
            <button className={`btn ${a.syncArmed ? 'btn-on' : ''}`} disabled={!ready || a.running} aria-pressed={a.syncArmed} onClick={() => arranger.syncStart()}>
              Sync Start<Key action="rhythm:sync" />
            </button>
            <button className={`btn ${a.section === 'intro' ? 'btn-on' : ''}`} disabled={!ready || a.running} onClick={() => arranger.intro()}>Intro</button>
            <button className={`btn ${a.section === 'fill' ? 'btn-on' : ''}`} disabled={!a.running} onClick={() => arranger.fill()}>
              Fill In<Key action="rhythm:fill" />
            </button>
            <button className={`btn ${a.section === 'break' ? 'btn-on' : ''}`} disabled={!a.running} onClick={() => arranger.breakBar()}>
              Break<Key action="rhythm:break" />
            </button>
            <button className={`btn ${a.section === 'ending' ? 'btn-on' : ''}`} disabled={!a.running} onClick={() => arranger.ending()}>
              Ending<Key action="rhythm:ending" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {['A', 'B', 'C', 'D'].map((v, i) => (
              <button
                key={v}
                className={`btn flex-1 ${a.variation === i ? 'btn-on' : ''} ${a.pendingVariation === i ? 'animate-pulse border-accent/60' : ''}`}
                aria-pressed={shownVariation === i}
                onClick={() => arranger.setVariation(i)}
              >
                Main {v}
              </button>
            ))}
            <span className="text-[11px] text-zinc-500"><Key action="rhythm:prevVar" /><Key action="rhythm:nextVar" /></span>
          </div>
          <div className="flex flex-wrap gap-6">
            <Slider label="Band volume" value={s.accompVolume} onChange={(v) => s.set({ accompVolume: v })} />
            <Slider label="Drum volume" value={s.drumVolume} onChange={(v) => s.set({ drumVolume: v })} />
          </div>
        </section>
      </div>

      {/* Chords */}
      <section className="panel p-4" aria-label="Chord control">
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-[8rem]">
            <div className="panel-title">Chord</div>
            <div data-testid="chord" className="mt-0.5 text-3xl font-semibold tracking-tight text-accent-soft" aria-live="polite">
              {a.chord ? chordName(a.chord) : '–'}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="panel-title">Chord input</span>
            <div className="flex gap-1">
              <button className={`btn btn-sm ${s.chordMode === 'pads' ? 'btn-on' : ''}`} onClick={() => s.set({ chordMode: 'pads' })}>Chord keys</button>
              <button className={`btn btn-sm ${s.chordMode === 'fingered' ? 'btn-on' : ''}`} onClick={() => s.set({ chordMode: 'fingered' })}>Fingered</button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="panel-title">Song key</span>
            <div className="flex gap-1">
              <select aria-label="Key" className="field" value={s.keyTonic} onChange={(e) => { s.set({ keyTonic: Number(e.target.value) }); e.target.blur(); }}>
                {NOTE_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
              </select>
              <select aria-label="Mode" className="field" value={s.keyMode} onChange={(e) => { s.set({ keyMode: e.target.value as 'major' | 'minor' }); e.target.blur(); }}>
                <option value="major">major</option>
                <option value="minor">minor</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="panel-title">Any chord</span>
            <div className="flex gap-1">
              <select aria-label="Chord root" className="field" value={freeRoot} onChange={(e) => { setFreeRoot(Number(e.target.value)); e.target.blur(); }}>
                {NOTE_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
              </select>
              <select aria-label="Chord type" className="field" value={freeQuality} onChange={(e) => { setFreeQuality(e.target.value as ChordQuality); e.target.blur(); }}>
                {ALL_QUALITIES.map((q) => <option key={q} value={q}>{QUALITY_LABEL[q] || 'major'}</option>)}
              </select>
              <button className="btn btn-sm" onClick={() => setChordDirect({ root: freeRoot, quality: freeQuality })}>Set</button>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-5 gap-1.5 lg:grid-cols-10">
          {pads.map((c, i) => {
            const active = a.chord && a.chord.root === c.root && a.chord.quality === c.quality;
            return (
              <button key={i} data-testid={`pad-${i}`} className={`btn flex-col gap-0.5 py-2.5 ${active ? 'btn-on' : ''}`} onClick={() => triggerPad(i)} disabled={s.chordMode !== 'pads'}>
                <span className="text-base font-semibold">{chordName(c)}</span>
                <span className="flex items-center text-[10px] text-zinc-500">{roman[i]}<Key action={`chord:${i}`} /></span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] text-zinc-500">Colour the current chord:</span>
          {MODS.map((m) => (
            <button key={m.id} className="btn btn-sm" onClick={() => modifyChord(m.id)} disabled={!a.chord}>
              {m.label}<Key action={m.action} />
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-zinc-500">
          {s.chordMode === 'pads'
            ? 'Chord keys sit on the number row, away from the melody keys, so one hand can change chords while the other plays the tune. The chord stays until you choose another.'
            : 'Fingered mode recognises major, minor, 7th, sus and diminished chords from three or more notes you hold on the piano keys. The last chord stays latched while you play single notes.'}
          {' '}Drums play on their own; bass, keys and guitar join as soon as a chord is chosen.
        </p>
      </section>

      <ControlBar showMetronome={false} />
      <div className="panel overflow-hidden p-3 pb-4">
        <Piano low={s.rangeLow} high={s.rangeHigh} height={170} />
      </div>
      <KeyLegend showChords />
    </div>
  );
}
