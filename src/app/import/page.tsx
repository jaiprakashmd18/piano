'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { engine } from '@/lib/audio/engine';
import { presetById } from '@/lib/input/keymap';
import { buildMappingPlan, describeReport } from '@/lib/learn/mapping';
import type { Difficulty } from '@/lib/learn/types';
import { ImportedMidi, ImportedTrack, TrackRole, defaultRoles, parseMidi, songFromMidi } from '@/lib/midi/midi';
import { midiToName } from '@/lib/music/notes';
import { formatTime } from '@/lib/hooks';
import { songRepo } from '@/lib/storage/db';
import { useSettings } from '@/store/settings';

const ROLE_LABEL: Record<TrackRole, string> = {
  right: 'Right hand (melody)',
  left: 'Left hand',
  split: 'Both hands (split at middle C)',
  backing: 'Backing (the app plays it)',
  skip: 'Leave out',
};

export default function ImportPage() {
  const mapping = useSettings((s) => s.mapping);
  const input = useRef<HTMLInputElement>(null);
  const [midi, setMidi] = useState<ImportedMidi | null>(null);
  const [roles, setRoles] = useState<Record<number, TrackRole>>({});
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('Intermediate');
  const [authorised, setAuthorised] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [previewing, setPreviewing] = useState<number | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPreview = () => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = null;
    engine.cancelScheduled();
    setPreviewing(null);
  };
  useEffect(() => () => engine.cancelScheduled(), []);

  /** Plays the first ten seconds of one track so you can hear which one is the tune. */
  const preview = async (t: ImportedTrack) => {
    if (previewing === t.index) return stopPreview();
    stopPreview();
    try {
      await engine.start();
      await engine.setInstrument(engine.leadId);
    } catch {
      return setError('Audio could not be started for the preview.');
    }
    const LENGTH = 10;
    const start = engine.now() + 0.15;
    for (const n of t.notes) {
      const at = n.time - t.firstTime;
      if (at > LENGTH) break;
      engine.playScheduled(n.midi, n.velocity, Math.min(n.duration, 2), start + at, 'playback');
    }
    setPreviewing(t.index);
    previewTimer.current = setTimeout(() => setPreviewing(null), (LENGTH + 0.5) * 1000);
  };

  const read = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setSavedId(null);
    try {
      if (file.size > 5_000_000) throw new Error('That file is larger than 5 MB, which is unusual for MIDI. Please check it is a .mid file.');
      const parsed = parseMidi(await file.arrayBuffer(), file.name);
      stopPreview();
      setMidi(parsed);
      setRoles(defaultRoles(parsed));
      setTitle(parsed.name);
      setArtist('');
    } catch (e) {
      setMidi(null);
      setError(e instanceof Error ? e.message : 'The file could not be read.');
    }
  };

  const song = useMemo(() => (midi ? songFromMidi(midi, roles, 'preview') : null), [midi, roles]);
  const analysis = useMemo(() => {
    if (!song) return null;
    const melody = song.notes.filter((n) => n.hand === 'right');
    const all = song.notes;
    const two = presetById('two-row').mapping;
    return {
      melodyFold: buildMappingPlan(melody, mapping, { mode: 'fold', transpose: 0 }),
      melodyAuto: buildMappingPlan(melody, mapping, { mode: 'auto', transpose: 0 }),
      fullAuto: buildMappingPlan(all, mapping, { mode: 'auto', transpose: 0 }),
      fullTwoRow: buildMappingPlan(all, two, { mode: 'auto', transpose: 0 }),
      melodyCount: melody.length,
    };
  }, [song, mapping]);

  const save = async () => {
    if (!midi || !song) return;
    if (song.notes.length === 0) return setError('Choose at least one track to include.');
    const id = `import-${Date.now().toString(36)}`;
    try {
      await songRepo.save({ ...song, id, title: title.trim() || midi.name, artist: artist.trim() || 'Imported MIDI', difficulty });
      setSavedId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The song could not be saved in this browser.');
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-3 sm:p-4 lg:p-6 2xl:max-w-6xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">MIDI Import</h1>
        <p className="text-sm text-zinc-400">Turn a Standard MIDI File into a laptop-keyboard lesson. Files are read in your browser and never uploaded.</p>
      </header>

      <div
        className={`panel mt-4 flex flex-col items-center gap-3 border-dashed p-5 text-center sm:p-8 transition ${dragging ? '!border-accent bg-accent/5' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void read(e.dataTransfer.files[0]); }}
      >
        <p className="text-sm text-zinc-300">Drop a <span className="font-mono">.mid</span> file here</p>
        <button className="btn btn-primary" onClick={() => input.current?.click()}>Choose a MIDI file</button>
        <input ref={input} data-testid="midi-file" type="file" accept=".mid,.midi,audio/midi,audio/x-midi" className="sr-only" onChange={(e) => void read(e.target.files?.[0])} />
        <p className="max-w-xl text-xs leading-relaxed text-zinc-500">
          Only import music you are allowed to use: your own arrangements, public-domain works, or files you have licensed.
        </p>
      </div>

      {error && <div role="alert" className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>}

      {midi && song && analysis && (
        <>
          <section className="panel mt-4 p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-300">
              <span className="font-semibold text-zinc-100">{midi.name}</span>
              <span className="chip">{midi.bpm} BPM{midi.tempoChanges > 0 ? ` + ${midi.tempoChanges} tempo change${midi.tempoChanges > 1 ? 's' : ''}` : ''}</span>
              <span className="chip">{midi.timeSignature[0]}/{midi.timeSignature[1]}</span>
              <span className="chip">{formatTime(midi.duration)}</span>
              <span className="chip">{midi.tracks.length} track{midi.tracks.length > 1 ? 's' : ''}</span>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm" data-testid="tracks">
                <thead className="text-[11px] uppercase tracking-wider text-zinc-500">
                  <tr><th className="py-1.5 pr-3">Track</th><th className="pr-3">Instrument</th><th className="pr-3">Notes</th><th className="pr-3">Range</th><th className="pr-3">Plays</th><th className="pr-3">Listen</th><th>Use as</th></tr>
                </thead>
                <tbody>
                  {midi.tracks.map((t) => (
                    <tr key={t.index} className="border-t border-white/5">
                      <td className="py-2 pr-3 text-zinc-100">{t.name}</td>
                      <td className="pr-3 text-zinc-400">{t.percussion ? 'Percussion' : t.instrument}</td>
                      <td className="pr-3 font-mono text-zinc-300">{t.noteCount}</td>
                      <td className="pr-3 font-mono text-zinc-300">{t.percussion ? '–' : `${midiToName(t.low)} to ${midiToName(t.high)}`}</td>
                      <td className="whitespace-nowrap pr-3 font-mono text-zinc-300">{formatTime(t.firstTime)} to {formatTime(t.lastTime)}</td>
                      <td className="pr-3">
                        {!t.percussion && (
                          <button className={`btn btn-sm ${previewing === t.index ? 'btn-on' : ''}`} onClick={() => void preview(t)} aria-label={`Preview ${t.name}`}>
                            {previewing === t.index ? 'Stop' : 'Preview'}
                          </button>
                        )}
                      </td>
                      <td>
                        <select aria-label={`Role of ${t.name}`} className="field" value={roles[t.index] ?? 'skip'} onChange={(e) => setRoles({ ...roles, [t.index]: e.target.value as TrackRole })}>
                          {(Object.keys(ROLE_LABEL) as TrackRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">The app has guessed which track is the tune (a single-line part that plays for most of the song). If the guess is wrong, press <span className="font-semibold text-zinc-200">Preview</span> to hear each track and set the right one to “Right hand (melody)”. Set other tracks to “Backing” to have the app play them along with you. Drum tracks are left out.</p>
          </section>

          <section className="panel mt-4 p-4" data-testid="analysis">
            <div className="panel-title">How playable is this on a laptop keyboard?</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {[
                { name: 'Melody only, one octave (simplified)', plan: analysis.melodyFold, mode: 'fold' as const },
                { name: 'Melody only, octave follows the music', plan: analysis.melodyAuto, mode: 'auto' as const },
                { name: 'Full arrangement, your current layout', plan: analysis.fullAuto, mode: 'auto' as const },
                { name: 'Full arrangement, two-hand layout', plan: analysis.fullTwoRow, mode: 'auto' as const },
              ].map(({ name, plan, mode }) => {
                const issues = describeReport(plan.report, mode);
                return (
                  <div key={name} className="rounded-lg border border-white/5 bg-ink-900/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-zinc-200">{name}</span>
                      <span className={`chip ${issues.length === 0 ? '!border-good/40 !text-good' : '!border-accent/40 !text-accent-soft'}`}>{issues.length === 0 ? 'Fits as written' : 'Needs compromises'}</span>
                    </div>
                    {plan.report.total === 0 ? (
                      <p className="mt-2 text-xs text-zinc-500">No notes assigned.</p>
                    ) : issues.length === 0 ? (
                      <p className="mt-2 text-xs text-zinc-400">All {plan.report.total} notes map directly to keys.</p>
                    ) : (
                      <ul className="mt-2 space-y-1 text-xs leading-relaxed text-zinc-400">{issues.map((i) => <li key={i}>• {i}</li>)}</ul>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-zinc-500">
              A laptop keyboard cannot reproduce every two-hand piano texture. Nothing is removed from your file: notes you cannot reach are played by the app,
              and you can switch between these options at any time on the Learn page.
            </p>
          </section>

          <section className="panel mt-4 flex flex-wrap items-end gap-3 p-4">
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1"><span className="panel-title">Title</span><input className="field" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1"><span className="panel-title">Artist / composer</span><input className="field" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Optional" /></label>
            <label className="flex flex-col gap-1">
              <span className="panel-title">Difficulty</span>
              <select className="field" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
                {(['Beginner', 'Easy', 'Intermediate', 'Advanced'] as Difficulty[]).map((d) => <option key={d}>{d}</option>)}
              </select>
            </label>
            <label className="flex basis-full items-start gap-2 text-sm text-zinc-300">
              <input type="checkbox" className="mt-1" checked={authorised} onChange={(e) => setAuthorised(e.target.checked)} />
              I have the right to use this file (my own work, public domain, or licensed to me).
            </label>
            <button data-testid="save-song" className="btn btn-primary" disabled={!authorised || song.notes.length === 0} onClick={() => void save()}>Add to my library</button>
            {savedId && (
              <span className="flex items-center gap-2 text-sm text-good" role="status">
                Saved in this browser.
                <Link data-testid="learn-imported" className="btn btn-sm" href={`/learn?song=${savedId}`}>Start learning</Link>
              </span>
            )}
          </section>
        </>
      )}
    </div>
  );
}
