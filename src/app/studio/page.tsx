'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AudioGate } from '@/components/AudioGate';
import { ControlBar } from '@/components/ControlBar';
import { Piano } from '@/components/Piano';
import { instrumentById } from '@/lib/audio/instruments';
import { LiveCapture, player, recorder, renderRecordingToWav } from '@/lib/audio/recorder';
import { Recording, quantizeRecording, scaleRecording, transposeRecording, trimLeadingSilence, trimRecording } from '@/lib/audio/recording';
import { downloadBlob, safeFileName } from '@/lib/audio/wav';
import { engine } from '@/lib/audio/engine';
import type { Song } from '@/lib/learn/types';
import { notesToMidiFile, parseMidi } from '@/lib/midi/midi';
import { formatTime, useArranger, useEngineStatus, usePerformanceKeys } from '@/lib/hooks';
import { recordingRepo, songRepo } from '@/lib/storage/db';
import { useSettings } from '@/store/settings';

function Roll({ take, trim }: { take: Recording; trim: [number, number] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ take, trim });
  latest.current = { take, trim };
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const { take: rec, trim: tr } = latest.current;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0c0e12';
      ctx.fillRect(0, 0, w, h);
      const dur = Math.max(rec.duration, 1);
      let lo = 127;
      let hi = 0;
      for (const n of rec.notes) {
        lo = Math.min(lo, n.midi);
        hi = Math.max(hi, n.midi);
      }
      lo -= 2;
      hi += 2;
      const beat = 60 / rec.bpm;
      for (let b = 0; b * beat < dur; b++) {
        ctx.fillStyle = b % 4 === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)';
        ctx.fillRect((b * beat * w) / dur, 0, 1, h);
      }
      const rowH = h / Math.max(1, hi - lo + 1);
      for (const n of rec.notes) {
        ctx.fillStyle = `rgba(76,201,240,${0.45 + n.velocity * 0.55})`;
        ctx.fillRect((n.time / dur) * w, h - (n.midi - lo + 1) * rowH, Math.max(2, (n.duration / dur) * w - 1), Math.max(2, rowH - 1));
      }
      ctx.fillStyle = 'rgba(7,8,10,0.7)';
      ctx.fillRect(0, 0, (tr[0] / dur) * w, h);
      ctx.fillRect((tr[1] / dur) * w, 0, w, h);
      ctx.fillStyle = '#f5b544';
      ctx.fillRect((Math.min(player.position(), dur) / dur) * w, 0, 2, h);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="h-40 w-full rounded-lg border border-white/5" role="img" aria-label="Recorded notes" />;
}

export default function StudioPage() {
  usePerformanceKeys();
  const status = useEngineStatus();
  const arr = useArranger();
  const low = useSettings((s) => s.rangeLow);
  const high = useSettings((s) => s.rangeHigh);
  const recState = useSyncExternalStore(recorder.subscribe, recorder.getState, () => 'idle' as const);
  const playing = useSyncExternalStore(player.subscribe, player.getPlaying, () => false);

  const [takes, setTakes] = useState<Recording[]>([]);
  const [take, setTake] = useState<Recording | null>(null);
  const [history, setHistory] = useState<Recording[]>([]);
  const [dirty, setDirty] = useState(false);
  const [countBars, setCountBars] = useState(1);
  const [metro, setMetro] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [trim, setTrim] = useState<[number, number]>([0, 0]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [practiceId, setPracticeId] = useState<string | null>(null);
  const capture = useRef<LiveCapture | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => void recordingRepo.list().then((l) => setTakes(l.sort((a, b) => b.createdAt - a.createdAt))).catch(() => setMessage('Saved projects are unavailable in this browser (IndexedDB is blocked).')), []);
  useEffect(refresh, [refresh]);
  useEffect(() => () => { recorder.stop(); player.stop(); }, []);

  useEffect(() => {
    if (recState === 'idle') return;
    const id = setInterval(() => setElapsed(recorder.elapsed()), 200);
    return () => clearInterval(id);
  }, [recState]);

  const open = (rec: Recording, isNew = false) => {
    player.stop();
    setTake(rec);
    setHistory([]);
    setDirty(isNew);
    setTrim([0, rec.duration]);
    setPracticeId(null);
  };

  const edit = (fn: (r: Recording) => Recording) => {
    if (!take) return;
    player.stop();
    const next = fn(take);
    setHistory([...history, take]);
    setTake(next);
    setTrim([0, next.duration]);
    setDirty(true);
  };

  const toggleRecord = () => {
    if (recState === 'idle') {
      player.stop();
      setMessage(null);
      setElapsed(0);
      recorder.start({ countInBeats: countBars * 4, metronome: metro });
    } else {
      const rec = recorder.stop();
      if (rec) open(rec, true);
      else setMessage('Nothing was recorded. Press Record, wait for the count-in, then play.');
    }
  };

  const save = async () => {
    if (!take) return;
    try {
      await recordingRepo.save(take);
      setDirty(false);
      setMessage('Project saved in this browser.');
      refresh();
    } catch {
      setMessage('The project could not be saved (browser storage is unavailable).');
    }
  };

  const exportWav = async () => {
    if (!take) return;
    setBusy(true);
    setMessage('Rendering audio…');
    try {
      downloadBlob(await renderRecordingToWav(take), `${safeFileName(take.name)}.wav`, 'audio/wav');
      setMessage('WAV exported.');
    } catch (e) {
      setMessage(`WAV export failed: ${e instanceof Error ? e.message : 'offline rendering is not supported in this browser.'}`);
    } finally {
      setBusy(false);
    }
  };

  const toPractice = async () => {
    if (!take) return;
    const id = `rec-song-${take.id}`;
    const song: Song = {
      id, title: take.name, artist: 'My recording', difficulty: 'Intermediate', key: 'Unknown', bpm: take.bpm, duration: take.duration,
      arrangement: 'Recorded performance', license: 'Your own recording', source: 'recording', category: 'My recordings', timeSignature: [4, 4],
      notes: take.notes.map((n) => ({ ...n, hand: n.midi < 60 ? ('left' as const) : ('right' as const) })),
    };
    try {
      await songRepo.save(song);
      setPracticeId(id);
    } catch {
      setMessage('The song could not be saved (browser storage is unavailable).');
    }
  };

  const importMidi = async (file: File | undefined) => {
    if (!file) return;
    try {
      const m = parseMidi(await file.arrayBuffer(), file.name);
      const notes = m.tracks.filter((t) => !t.percussion).flatMap((t) => t.notes).sort((a, b) => a.time - b.time);
      open({ id: `rec-${Date.now().toString(36)}`, name: m.name, createdAt: Date.now(), bpm: m.bpm, instrumentId: engine.leadId, duration: notes.reduce((d, n) => Math.max(d, n.time + n.duration), 0), notes }, true);
      setMessage(`Imported ${notes.length} notes from ${file.name}.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'The file could not be read.');
    }
  };

  const toggleCapture = async () => {
    try {
      if (!capturing) {
        capture.current = new LiveCapture();
        capture.current.start();
        setCapturing(true);
        setMessage('Capturing everything you hear, including the rhythm section. Press again to finish.');
      } else {
        setCapturing(false);
        setBusy(true);
        downloadBlob(await capture.current!.stop(), `aurora-keys-live-${Date.now()}.wav`, 'audio/wav');
        setMessage('Live capture exported as WAV.');
      }
    } catch (e) {
      setCapturing(false);
      setMessage(e instanceof Error ? e.message : 'Live capture failed.');
    } finally {
      setBusy(false);
    }
  };

  const ready = status === 'ready';

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-4 p-4 lg:p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Recording Studio</h1>
        <p className="text-sm text-zinc-400">Record what you play, tidy it up, then export MIDI or WAV. Projects stay in this browser.</p>
      </header>
      <AudioGate />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="panel flex flex-wrap items-center gap-4 p-4" aria-label="Record">
            <button data-testid="record" className={`btn px-6 py-3 text-base ${recState !== 'idle' ? 'btn-danger animate-pulse' : 'btn-primary'}`} disabled={!ready} onClick={toggleRecord}>
              <span className={`h-3 w-3 rounded-full ${recState !== 'idle' ? 'bg-red-400' : 'bg-red-600'}`} />
              {recState === 'idle' ? 'Record' : recState === 'countin' ? 'Cancel' : 'Stop'}
            </button>
            <div className="min-w-[6rem] font-mono text-2xl text-zinc-100" aria-live="polite" data-testid="rec-status">
              {recState === 'countin' ? `Count-in ${recorder.countdown}` : recState === 'recording' ? formatTime(elapsed) : 'Ready'}
            </div>
            <label className="flex flex-col gap-1">
              <span className="panel-title">Count-in</span>
              <select className="field" value={countBars} onChange={(e) => { setCountBars(Number(e.target.value)); e.target.blur(); }} disabled={recState !== 'idle'}>
                <option value={0}>None</option>
                <option value={1}>1 bar</option>
                <option value={2}>2 bars</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={metro} onChange={(e) => setMetro(e.target.checked)} disabled={recState !== 'idle'} /> Metronome while recording ({arr.bpm} BPM)
            </label>
            <div className="ml-auto flex flex-wrap gap-2">
              <button className="btn btn-sm" onClick={() => fileInput.current?.click()}>Import MIDI as a take</button>
              <input ref={fileInput} type="file" accept=".mid,.midi" className="sr-only" onChange={(e) => void importMidi(e.target.files?.[0])} />
              <button className={`btn btn-sm ${capturing ? 'btn-danger' : ''}`} disabled={!ready || busy || !LiveCapture.supported()} onClick={() => void toggleCapture()} title="Records the live mix, including accompaniment, to WAV">
                {capturing ? 'Finish live capture' : 'Capture live audio to WAV'}
              </button>
            </div>
          </section>

          {message && <div role="status" className="rounded-lg border border-white/10 bg-ink-800 px-4 py-2 text-sm text-zinc-300">{message}</div>}

          {take ? (
            <section className="panel flex flex-col gap-3 p-4" aria-label="Take editor">
              <div className="flex flex-wrap items-center gap-2">
                <input aria-label="Take name" className="field min-w-[14rem] flex-1 text-base font-semibold" value={take.name} onChange={(e) => { setTake({ ...take, name: e.target.value }); setDirty(true); }} />
                <span className="chip" data-testid="take-info">{take.notes.length} notes</span>
                <span className="chip">{formatTime(take.duration)}</span>
                <span className="chip">{take.bpm} BPM</span>
                <span className="chip">{instrumentById(take.instrumentId).name}</span>
                {dirty && <span className="chip !border-accent/40 !text-accent-soft">Unsaved</span>}
              </div>
              <Roll take={take} trim={trim} />
              <div className="flex flex-wrap items-end gap-3">
                <button data-testid="play-take" className={`btn px-5 ${playing ? '' : 'btn-primary'}`} disabled={!ready} onClick={() => (playing ? player.stop() : player.play(take, speed, 0))}>{playing ? 'Stop' : 'Play'}</button>
                <label className="flex w-44 flex-col gap-1">
                  <span className="panel-title">Playback tempo {Math.round(speed * 100)}%</span>
                  <input type="range" min={0.5} max={1.5} step={0.05} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
                </label>
                <button className="btn btn-sm" disabled={speed === 1} onClick={() => { edit((r) => scaleRecording(r, speed)); setSpeed(1); }}>Apply tempo to take</button>
                <label className="flex flex-col gap-1"><span className="panel-title">Trim from (s)</span><input type="number" className="field w-24" min={0} max={take.duration} step={0.1} value={+trim[0].toFixed(2)} onChange={(e) => setTrim([Math.max(0, Number(e.target.value)), trim[1]])} /></label>
                <label className="flex flex-col gap-1"><span className="panel-title">to (s)</span><input type="number" className="field w-24" min={0} max={take.duration} step={0.1} value={+trim[1].toFixed(2)} onChange={(e) => setTrim([trim[0], Math.min(take.duration, Number(e.target.value))])} /></label>
                <button className="btn btn-sm" disabled={trim[1] - trim[0] < 0.1 || (trim[0] === 0 && trim[1] >= take.duration)} onClick={() => edit((r) => trimRecording(r, trim[0], trim[1]))}>Trim</button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-sm" onClick={() => edit(trimLeadingSilence)}>Remove silence at start</button>
                <button className="btn btn-sm" onClick={() => edit((r) => quantizeRecording(r, 2))}>Quantise to 1/8</button>
                <button className="btn btn-sm" onClick={() => edit((r) => quantizeRecording(r, 4))}>Quantise to 1/16</button>
                <button className="btn btn-sm" onClick={() => edit((r) => transposeRecording(r, -1))}>Transpose −1</button>
                <button className="btn btn-sm" onClick={() => edit((r) => transposeRecording(r, 1))}>Transpose +1</button>
                <button className="btn btn-sm" onClick={() => edit((r) => ({ ...r, instrumentId: engine.leadId }))}>Use current instrument</button>
                <button className="btn btn-sm" disabled={history.length === 0} onClick={() => { const prev = history[history.length - 1]; setHistory(history.slice(0, -1)); setTake(prev); setTrim([0, prev.duration]); }}>Undo</button>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
                <button data-testid="save-take" className="btn btn-primary btn-sm" onClick={() => void save()}>Save project</button>
                <button data-testid="export-midi" className="btn btn-sm" onClick={() => downloadBlob(notesToMidiFile(take.notes, take.bpm, take.name) as BlobPart, `${safeFileName(take.name)}.mid`, 'audio/midi')}>Export MIDI</button>
                <button data-testid="export-wav" className="btn btn-sm" disabled={busy || !ready} onClick={() => void exportWav()}>Export WAV</button>
                <button className="btn btn-sm" onClick={() => void toPractice()}>Practise this in Learn</button>
                {practiceId && <Link className="btn btn-sm btn-on" href={`/learn?song=${practiceId}`}>Open lesson</Link>}
              </div>
              <p className="text-[11px] text-zinc-500">
                MIDI and WAV export contain the notes you played. To include the rhythm section, use “Capture live audio to WAV” while playing with the arranger.
              </p>
            </section>
          ) : (
            <section className="panel p-8 text-center text-sm text-zinc-400">Press <span className="font-semibold text-zinc-200">Record</span>, wait for the count-in, and play. Your take appears here for editing.</section>
          )}
        </div>

        <aside className="panel h-fit p-4" aria-label="Saved projects">
          <div className="panel-title mb-2">Saved projects</div>
          {takes.length === 0 ? (
            <p className="text-xs text-zinc-500">Nothing saved yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5" data-testid="projects">
              {takes.map((t) => (
                <li key={t.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${take?.id === t.id ? 'border-accent/40 bg-accent/5' : 'border-white/5'}`}>
                  <button className="min-w-0 flex-1 text-left" onClick={() => open(t)}>
                    <span className="block truncate text-sm text-zinc-200">{t.name}</span>
                    <span className="block text-[11px] text-zinc-500">{t.notes.length} notes · {formatTime(t.duration)}</span>
                  </button>
                  <button className="btn btn-sm" aria-label={`Delete ${t.name}`} onClick={() => { if (confirm(`Delete "${t.name}"?`)) void recordingRepo.remove(t.id).then(() => { if (take?.id === t.id) setTake(null); refresh(); }); }}>✕</button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <ControlBar />
      <div className="panel overflow-hidden p-3 pb-4">
        <Piano low={low} high={high} height={170} />
      </div>
    </div>
  );
}
