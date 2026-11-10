'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioGate } from '@/components/AudioGate';
import { InstrumentSelect, Slider } from '@/components/ControlBar';
import { FallingNotes, LaneCue, LaneNote } from '@/components/FallingNotes';
import { Piano } from '@/components/Piano';
import { engine } from '@/lib/audio/engine';
import { ticker } from '@/lib/audio/ticker';
import { keyboard } from '@/lib/input/keyboard';
import { codesForAction, labelForCode } from '@/lib/input/keymap';
import type { Stats } from '@/lib/learn/evaluator';
import { MappingMode, buildMappingPlan, describeReport, suggestTransposition } from '@/lib/learn/mapping';
import { PHRASE_PASS, Tutor, splitPhrases } from '@/lib/learn/tutor';
import type { Hand, Song } from '@/lib/learn/types';
import { midiToName } from '@/lib/music/notes';
import { formatTime, useEngineStatus, usePerformanceKeys, useUi } from '@/lib/hooks';
import { loadAllSongs } from '@/lib/songs';
import { progressRepo } from '@/lib/storage/db';
import { toggleFullscreen } from '@/components/AppShell';
import { useSettings } from '@/store/settings';

type Mode = 'listen' | 'beginner' | 'wait' | 'practice' | 'step' | 'challenge';
type HandChoice = 'right' | 'left' | 'both';

const MODES: { id: Mode; name: string; text: string }[] = [
  { id: 'listen', name: 'Listen', text: 'Watch and hear the song played for you.' },
  { id: 'beginner', name: 'Beginner', text: 'One note at a time, right hand only. The song waits for you.' },
  { id: 'wait', name: 'Wait Mode', text: 'The song pauses at every note until you press the right key.' },
  { id: 'practice', name: 'Practice', text: 'Play in time. Every note is scored for accuracy and timing.' },
  { id: 'step', name: 'Step by Step', text: `Learn one phrase at a time. A phrase repeats until you reach ${PHRASE_PASS}%.` },
  { id: 'challenge', name: 'Challenge', text: 'Notes appear only at the last moment and without key letters.' },
];

const SPEEDS = [0.25, 0.5, 0.75, 1];

interface Snapshot {
  time: number;
  playing: boolean;
  waiting: boolean;
  finished: boolean;
  phraseIndex: number;
  phraseAccuracy: number | null;
  awaited: number[];
  stats: Stats | null;
}

const EMPTY: Snapshot = { time: 0, playing: false, waiting: false, finished: false, phraseIndex: 0, phraseAccuracy: null, awaited: [], stats: null };

function feedbackLines(s: Stats, wait: boolean): string[] {
  const out: string[] = [];
  if (s.accuracy >= 95 && s.wrong === 0) out.push('Clean run. Try the next speed up, or switch to Challenge mode.');
  if (s.missed > s.total * 0.2) out.push('Many notes went by unplayed. Slow down to 50% or use Wait Mode for this passage.');
  if (s.wrong > s.total * 0.2) out.push('Quite a few wrong keys. Loop the difficult bars and watch the key letters.');
  if (!wait && s.correct > 4 && s.earlyRatio > 0.7) out.push('You tend to play early. Let the note touch the line before pressing.');
  if (!wait && s.correct > 4 && s.earlyRatio < 0.3) out.push('You tend to play late. Prepare your finger while the note is still falling.');
  if (!wait && s.meanErrorMs > 120) out.push(`Average timing error ${s.meanErrorMs} ms. The metronome and slower speeds help tighten this.`);
  if (out.length === 0) out.push('Good work. Repeat once more to make it stick.');
  return out;
}

export function LearnView() {
  usePerformanceKeys();
  const params = useSearchParams();
  const router = useRouter();
  const status = useEngineStatus();
  const mapping = useSettings((s) => s.mapping);
  const octaveShift = useSettings((s) => s.octaveShift);
  const showNoteNames = useSettings((s) => s.showNoteNames);
  const masterVolume = useSettings((s) => s.masterVolume);
  const layout = useUi((s) => s.layout);
  const fullscreen = useUi((s) => s.fullscreen);

  const [songs, setSongs] = useState<Song[]>([]);
  const [mode, setMode] = useState<Mode>('wait');
  const [handChoice, setHandChoice] = useState<HandChoice>('right');
  const [speed, setSpeed] = useState(1);
  const [mapMode, setMapMode] = useState<MappingMode>('auto');
  const [maxKeys, setMaxKeys] = useState(0);
  const [transpose, setTranspose] = useState(0);
  const [backing, setBacking] = useState(true);
  const [loop, setLoop] = useState<{ from: number; to: number } | null>(null);
  const [loopStart, setLoopStart] = useState<number | null>(null);
  const [pps, setPps] = useState(170);
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [best, setBest] = useState<number | null>(null);

  const tutorRef = useRef<Tutor | null>(null);
  const wrongAt = useRef(0);
  const savedRef = useRef(false);

  useEffect(() => {
    void loadAllSongs().then(setSongs);
  }, []);

  // The tutor decides pitches itself, so the performance transpose is parked while this page is open.
  useEffect(() => {
    const before = useSettings.getState();
    const saved = { transpose: before.transpose, octaveShift: before.octaveShift };
    before.set({ transpose: 0 });
    return () => useSettings.getState().set(saved);
  }, []);

  const songId = params.get('song') ?? 'ode-to-joy';
  const song = useMemo(() => songs.find((s) => s.id === songId) ?? null, [songs, songId]);
  const hasLeft = useMemo(() => song?.notes.some((n) => n.hand === 'left') ?? false, [song]);
  const hasRight = useMemo(() => song?.notes.some((n) => n.hand === 'right') ?? false, [song]);

  const hands: Hand[] = useMemo(() => {
    if (mode === 'listen') return [];
    if (mode === 'beginner') return [hasRight ? 'right' : 'left'];
    if (handChoice === 'both') return [...(hasRight ? ['right' as Hand] : []), ...(hasLeft ? ['left' as Hand] : [])];
    if (handChoice === 'left' && hasLeft) return ['left'];
    return [hasRight ? 'right' : 'left'];
  }, [mode, handChoice, hasLeft, hasRight]);

  const effMapMode: MappingMode = mode === 'beginner' ? 'fold' : mapMode;
  const effMaxKeys = mode === 'beginner' ? 1 : maxKeys;

  const { plan, backingNotes } = useMemo(() => {
    const notes = song?.notes ?? [];
    const mine = hands.length ? notes.filter((n) => hands.includes(n.hand)) : notes;
    const rest = hands.length ? notes.filter((n) => !hands.includes(n.hand)) : [];
    return {
      plan: buildMappingPlan(mine, mapping, { mode: effMapMode, transpose, maxSimultaneous: effMaxKeys || undefined }),
      backingNotes: rest,
    };
  }, [song, hands, mapping, effMapMode, transpose, effMaxKeys]);

  const suggested = useMemo(() => (song ? suggestTransposition(song.notes) : 0), [song]);
  const beat = song ? 60 / song.bpm : 0.5;
  const barBeats = song ? (song.timeSignature[1] === 8 ? song.timeSignature[0] / 2 : song.timeSignature[0]) : 4;

  // (Re)build the tutor whenever the lesson definition changes.
  useEffect(() => {
    if (!song) return;
    const previous = tutorRef.current;
    const keepTime = previous && previous.duration === song.duration + 0 ? previous.time() : 0;
    previous?.pause();
    const phrases = splitPhrases(plan.notes.filter((n) => !n.assisted), beat * barBeats, song.duration, 2);
    const tutor = new Tutor(
      plan,
      backingNotes,
      song.duration,
      phrases,
      { hands, wait: mode === 'beginner' || mode === 'wait', speed, loop, step: mode === 'step', shiftMode: effMapMode, backing },
      {
        now: () => engine.now(),
        play: (midi, velocity, duration, when) => engine.playScheduled(midi, velocity, duration, when, 'tutor'),
        cancel: () => engine.cancelScheduled(),
        setShift: (shift) => useSettings.getState().set({ octaveShift: shift }),
      },
    );
    if (effMapMode === 'manual' && hands.length) useSettings.getState().set({ octaveShift: plan.shifts[0]?.shift ?? 0 });
    if (mode !== 'step' && !loop && keepTime > 0 && keepTime < song.duration) tutor.seek(keepTime);
    tutorRef.current = tutor;
    savedRef.current = false;
    setSnap({ ...EMPTY, time: tutor.time() });
    return () => tutor.pause();
    // speed and loop are pushed into the running tutor below instead of rebuilding it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song, plan, backingNotes, mode, backing, effMapMode]);

  useEffect(() => tutorRef.current?.setSpeed(speed), [speed]);
  useEffect(() => tutorRef.current?.setLoop(loop), [loop]);

  useEffect(() => {
    if (!song) return;
    setLoop(null);
    setLoopStart(null);
    setBest(null);
    void progressRepo.get(song.id).then((p) => setBest(p?.bestScore ?? null)).catch(() => {});
  }, [song]);

  // Drive the tutor from the audio ticker; refresh on-screen numbers ~8x per second.
  useEffect(() => {
    let n = 0;
    return ticker.add(() => {
      const t = tutorRef.current;
      if (!t) return;
      const wasPlaying = t.playing;
      t.update();
      if (++n % 5 !== 0 && wasPlaying === t.playing) return;
      setSnap({
        time: t.time(),
        playing: t.playing,
        waiting: t.waiting,
        finished: t.finished,
        phraseIndex: t.phraseIndex,
        phraseAccuracy: t.lastPhraseAccuracy,
        awaited: t.awaited(),
        stats: t.isPractice ? t.stats() : null,
      });
    });
  }, []);

  // Judge every key the learner plays.
  useEffect(
    () =>
      engine.notes.on((e) => {
        if (e.source !== 'user' || e.type !== 'on') return;
        const fb = tutorRef.current?.onUserNote(e.midi);
        if (fb?.kind === 'wrong') wrongAt.current = performance.now();
      }),
    [],
  );

  const togglePlay = useCallback(() => {
    const t = tutorRef.current;
    if (!t) return;
    if (!engine.ready) {
      void engine.start().catch(() => {});
      return;
    }
    if (t.playing) t.pause();
    else t.play();
  }, []);

  const restart = useCallback(() => {
    const t = tutorRef.current;
    if (!t) return;
    t.seek(loop ? loop.from : 0);
    savedRef.current = false;
  }, [loop]);

  useEffect(() => {
    keyboard.overrides = { 'rhythm:toggle': togglePlay, 'rhythm:fill': restart };
    return () => {
      keyboard.overrides = {};
    };
  }, [togglePlay, restart]);

  // Save the best score once a practice run completes.
  useEffect(() => {
    if (!snap.finished || !snap.stats || !song || savedRef.current || mode === 'listen') return;
    savedRef.current = true;
    const score = snap.stats.score;
    void progressRepo
      .get(song.id)
      .then((p) => {
        const bestScore = Math.max(p?.bestScore ?? 0, score);
        setBest(bestScore);
        return progressRepo.save({ id: song.id, bestScore, plays: (p?.plays ?? 0) + 1, lastPlayed: Date.now() });
      })
      .catch(() => {});
  }, [snap.finished, snap.stats, song, mode]);

  const { laneNotes, low, high } = useMemo(() => {
    const out: LaneNote[] = [];
    const listen = hands.length === 0;
    for (const n of plan.notes) {
      const target = !listen && !n.assisted && n.code !== null;
      const midi = target ? n.playMidi : n.midi + transpose;
      out.push({
        id: n.index, midi, time: n.time, duration: n.duration, hand: n.hand, target: target || listen,
        key: n.code ? labelForCode(n.code, layout) : '', name: midiToName(midi), folded: n.folded,
      });
    }
    if (backing || listen) {
      backingNotes.forEach((n, i) =>
        out.push({ id: -1 - i, midi: n.midi + transpose, time: n.time, duration: n.duration, hand: n.hand, target: false, key: '', name: '', folded: false }),
      );
    }
    out.sort((a, b) => a.time - b.time);
    // The keyboard is framed around what the learner plays; far-away backing notes are simply off-screen.
    const framed = listen ? out : out.filter((n) => n.target);
    let lo = 127;
    let hi = 0;
    for (const n of framed.length ? framed : out) {
      lo = Math.min(lo, n.midi);
      hi = Math.max(hi, n.midi);
    }
    if (out.length === 0) [lo, hi] = [60, 72];
    const pad = listen ? 1 : 8;
    lo = Math.max(21, Math.floor((lo - pad) / 12) * 12);
    hi = Math.min(108, Math.ceil((hi + pad) / 12) * 12);
    while (hi - lo < 36) {
      if (lo > 36) lo -= 12;
      else hi += 12;
    }
    return { laneNotes: out, low: lo, high: hi };
  }, [plan, backingNotes, backing, hands, transpose, layout]);

  const cues: LaneCue[] = useMemo(() => {
    if (hands.length === 0 || effMapMode === 'fold') return [];
    const down = codesForAction(mapping, 'octave:down')[0];
    const up = codesForAction(mapping, 'octave:up')[0];
    return plan.shifts.slice(1).map((c, i) => {
      const diff = c.shift - plan.shifts[i].shift;
      const key = labelForCode((diff > 0 ? up : down) ?? '', layout);
      const times = Math.abs(diff) > 1 ? ` ×${Math.abs(diff)}` : '';
      return { time: c.time, text: effMapMode === 'manual' ? `Press ${key}${times} (octave ${diff > 0 ? 'up' : 'down'})` : `Octave ${diff > 0 ? 'up' : 'down'}${times} (automatic)` };
    });
  }, [plan, hands, effMapMode, mapping, layout]);

  const getTime = useCallback(() => tutorRef.current?.time() ?? 0, []);
  const getState = useCallback((id: number) => tutorRef.current?.evaluator.stateOf(id) ?? 'pending', []);

  const awaitedNotes = useMemo(() => {
    const byIndex = new Map(plan.notes.map((n) => [n.index, n]));
    return snap.awaited.map((id) => byIndex.get(id)!).filter(Boolean);
  }, [snap.awaited, plan]);
  const hintMidis = useMemo(() => awaitedNotes.map((n) => n.playMidi), [awaitedNotes]);

  const warnings = useMemo(() => (hands.length ? describeReport(plan.report, effMapMode) : []), [plan, hands, effMapMode]);
  const isPractice = hands.length > 0;
  const wait = mode === 'beginner' || mode === 'wait';
  const laneHeight = fullscreen ? 520 : 380;

  if (songs.length > 0 && !song) {
    return (
      <div className="p-6">
        <p className="text-sm text-zinc-400">That song is not in your library.</p>
        <Link className="btn mt-3" href="/library">Open the Song Library</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-zinc-50">{song?.title ?? 'Learn Songs'}</h1>
          {song && (
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-zinc-400">
              {song.artist}
              <span className="chip">{song.difficulty}</span>
              <span className="chip">{song.key}</span>
              <span className="chip">{song.bpm} BPM</span>
              <span className="chip">{formatTime(song.duration)}</span>
              <span className="chip">{song.arrangement}</span>
              {best !== null && <span className="chip !border-accent/40 !text-accent-soft">Best {best}%</span>}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Song"
            className="field max-w-[16rem]"
            value={songId}
            onChange={(e) => {
              router.replace(`/learn?song=${encodeURIComponent(e.target.value)}`);
              e.target.blur();
            }}
          >
            {songs.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
          <InstrumentSelect className="max-w-[12rem]" />
          <button className="btn btn-sm" onClick={toggleFullscreen}>{fullscreen ? 'Exit full screen' : 'Full screen'}</button>
        </div>
      </header>
      <AudioGate />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="panel relative overflow-hidden">
            <div
              onWheel={(e) => {
                const t = tutorRef.current;
                if (!t) return;
                if (e.ctrlKey || e.metaKey) setPps((p) => Math.max(60, Math.min(420, p * (e.deltaY > 0 ? 0.9 : 1.1))));
                else if (!t.playing || !t.isPractice) t.seek(t.time() - e.deltaY / pps);
              }}
            >
              <FallingNotes
                notes={laneNotes} cues={cues} low={low} high={high} height={laneHeight} pps={pps} getTime={getTime} getState={getState}
                beat={beat} barBeats={barBeats} challenge={mode === 'challenge'} loop={loop} wrongAt={wrongAt} showNames={showNoteNames}
              />
            </div>
            <Piano low={low} high={high} height={150} hints={hintMidis} autoFit={false} />

            {wait && isPractice && snap.playing && awaitedNotes.length > 0 && (
              <div data-testid="prompt" className="pointer-events-none absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-good/40 bg-ink-950/85 px-5 py-3 shadow-lg backdrop-blur">
                <span className="text-sm text-zinc-300">Press</span>
                {awaitedNotes.map((n) => (
                  <span key={n.index} className="flex flex-col items-center">
                    <span className="kbd !min-w-[2.4rem] !py-1.5 !text-xl !text-good">{n.code ? labelForCode(n.code, layout) : '?'}</span>
                    <span className="mt-1 text-[11px] text-zinc-400">{midiToName(n.playMidi)}</span>
                  </span>
                ))}
              </div>
            )}

            {snap.finished && (
              <div className="absolute inset-0 z-10 grid place-items-center bg-ink-950/80 p-4 backdrop-blur-sm">
                <div className="panel w-full max-w-md p-6 text-center" role="status">
                  {snap.stats ? (
                    <>
                      <div className="panel-title">Practice score</div>
                      <div data-testid="final-score" className="mt-1 text-6xl font-semibold tracking-tight text-accent-soft">{snap.stats.score}<span className="text-2xl text-zinc-500">%</span></div>
                      <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                        <div className="rounded-lg bg-good/10 p-2 text-good"><div className="text-xl font-semibold">{snap.stats.correct}</div>correct</div>
                        <div className="rounded-lg bg-bad/10 p-2 text-bad"><div className="text-xl font-semibold">{snap.stats.wrong}</div>wrong</div>
                        <div className="rounded-lg bg-white/5 p-2 text-zinc-300"><div className="text-xl font-semibold">{snap.stats.missed}</div>missed</div>
                      </div>
                      {!wait && <p className="mt-3 text-xs text-zinc-400">Timing: {snap.stats.perfect} perfect · {snap.stats.good} good · {snap.stats.ok} ok · average error {snap.stats.meanErrorMs} ms</p>}
                      <ul className="mt-3 space-y-1 text-left text-sm text-zinc-300">
                        {feedbackLines(snap.stats, wait).map((l) => <li key={l} className="flex gap-2"><span className="text-accent">›</span>{l}</li>)}
                      </ul>
                    </>
                  ) : (
                    <p className="text-lg text-zinc-200">That was the whole piece. Pick a practice mode to try it yourself.</p>
                  )}
                  <div className="mt-5 flex justify-center gap-2">
                    <button className="btn btn-primary" onClick={() => { restart(); tutorRef.current?.play(); }}>Play again</button>
                    <Link className="btn" href="/library">Choose another song</Link>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Transport */}
          <div className="panel flex flex-col gap-3 p-4">
            <div className="flex items-center gap-3">
              <span className="w-10 font-mono text-xs text-zinc-400">{formatTime(snap.time)}</span>
              <div className="relative flex-1">
                {song && loop && (
                  <div className="pointer-events-none absolute top-1/2 h-3 -translate-y-1/2 rounded bg-accent/30 ring-1 ring-accent/60" style={{ left: `${(loop.from / song.duration) * 100}%`, width: `${((loop.to - loop.from) / song.duration) * 100}%` }} />
                )}
                <input
                  type="range" aria-label="Song position" min={0} max={song?.duration ?? 1} step={0.01} value={Math.min(snap.time, song?.duration ?? 1)}
                  onChange={(e) => tutorRef.current?.seek(Number(e.target.value))} className="relative"
                />
              </div>
              <span className="w-10 text-right font-mono text-xs text-zinc-400">{formatTime(song?.duration ?? 0)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button data-testid="play" className={`btn px-5 ${snap.playing ? '' : 'btn-primary'}`} onClick={togglePlay} disabled={!song || status === 'starting'}>
                {snap.playing ? 'Pause' : 'Play'} <span className="kbd">Space</span>
              </button>
              <button className="btn" onClick={restart}>Restart <span className="kbd">Enter</span></button>
              <div className="ml-2 flex items-center gap-1" role="group" aria-label="Practice speed">
                <span className="panel-title mr-1">Speed</span>
                {SPEEDS.map((s) => (
                  <button key={s} className={`btn btn-sm ${speed === s ? 'btn-on' : ''}`} aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s * 100}%</button>
                ))}
              </div>
              <div className="ml-2 flex items-center gap-1" role="group" aria-label="Loop">
                <span className="panel-title mr-1">Loop</span>
                <button className={`btn btn-sm ${loopStart !== null ? 'btn-on' : ''}`} onClick={() => setLoopStart(getTime())} disabled={mode === 'step'}>
                  Set A{loopStart !== null ? ` ${formatTime(loopStart)}` : ''}
                </button>
                <button
                  className="btn btn-sm"
                  disabled={loopStart === null || mode === 'step'}
                  onClick={() => {
                    const b = getTime();
                    if (loopStart !== null && b - loopStart > 0.3) setLoop({ from: loopStart, to: b });
                  }}
                >
                  Set B
                </button>
                <button className="btn btn-sm" disabled={!loop && loopStart === null} onClick={() => { setLoop(null); setLoopStart(null); }}>Clear</button>
              </div>
              <div className="ml-auto flex items-center gap-1" role="group" aria-label="Zoom">
                <span className="panel-title mr-1">Zoom</span>
                <button className="btn btn-sm w-8" onClick={() => setPps((p) => Math.max(60, p / 1.25))} aria-label="Zoom out">−</button>
                <button className="btn btn-sm w-8" onClick={() => setPps((p) => Math.min(420, p * 1.25))} aria-label="Zoom in">+</button>
              </div>
            </div>
            <p className="text-[11px] text-zinc-500">
              Blue = right hand, purple = left hand, grey = played by the app, dashed outline = moved to another octave to fit your keys.
              Scroll over the notes to move through the song; Ctrl + scroll zooms. Octave now: {octaveShift > 0 ? `+${octaveShift}` : octaveShift}.
            </p>
          </div>
        </div>

        {/* Lesson settings */}
        <aside className="flex flex-col gap-3">
          <section className="panel p-4" aria-label="Learning mode">
            <div className="panel-title mb-2">Mode</div>
            <div className="grid grid-cols-2 gap-1.5">
              {MODES.map((m) => (
                <button key={m.id} data-testid={`mode-${m.id}`} className={`btn btn-sm ${mode === m.id ? 'btn-on' : ''}`} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>{m.name}</button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">{MODES.find((m) => m.id === mode)!.text}</p>
            {mode === 'step' && tutorRef.current && (
              <p className="mt-2 text-xs text-accent-soft">
                Phrase {snap.phraseIndex + 1} of {tutorRef.current.phrases.length}
                {snap.phraseAccuracy !== null && ` · last try ${snap.phraseAccuracy}%`}
              </p>
            )}
          </section>

          <section className="panel flex flex-col gap-3 p-4" aria-label="Lesson options">
            <div>
              <div className="panel-title mb-1.5">Hands</div>
              <div className="flex gap-1.5">
                {(['right', 'left', 'both'] as HandChoice[]).map((h) => (
                  <button
                    key={h} className={`btn btn-sm flex-1 capitalize ${handChoice === h && mode !== 'listen' && mode !== 'beginner' ? 'btn-on' : ''}`}
                    disabled={mode === 'listen' || mode === 'beginner' || (h !== 'right' && !hasLeft)} onClick={() => setHandChoice(h)}
                  >
                    {h === 'both' ? 'Both' : `${h} hand`}
                  </button>
                ))}
              </div>
              {!hasLeft && song && <p className="mt-1 text-[11px] text-zinc-500">This arrangement has a right-hand part only.</p>}
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={backing} onChange={(e) => setBacking(e.target.checked)} disabled={mode === 'listen'} />
              App plays the other hand
            </label>
            <div>
              <div className="panel-title mb-1.5">Fitting the song to your keys</div>
              <select aria-label="Mapping mode" className="field w-full" value={effMapMode} disabled={mode === 'beginner'} onChange={(e) => { setMapMode(e.target.value as MappingMode); e.target.blur(); }}>
                <option value="auto">Follow the music (octave changes automatically)</option>
                <option value="fold">Stay in one octave (simplified)</option>
                <option value="manual">I press the octave keys myself</option>
              </select>
            </div>
            <div className="flex gap-2">
              <label className="flex flex-1 flex-col gap-1">
                <span className="panel-title">Keys at once</span>
                <select aria-label="Maximum simultaneous keys" className="field" value={effMaxKeys} disabled={mode === 'beginner'} onChange={(e) => { setMaxKeys(Number(e.target.value)); e.target.blur(); }}>
                  <option value={0}>As written</option>
                  <option value={1}>1 (melody)</option>
                  <option value={2}>Up to 2</option>
                  <option value={3}>Up to 3</option>
                </select>
              </label>
              <label className="flex flex-1 flex-col gap-1">
                <span className="panel-title">Transpose</span>
                <select aria-label="Song transposition" className="field" value={transpose} onChange={(e) => { setTranspose(Number(e.target.value)); e.target.blur(); }}>
                  {Array.from({ length: 13 }, (_, i) => i - 6).map((t) => (
                    <option key={t} value={t}>{t > 0 ? `+${t}` : t}{t === suggested && t !== 0 ? ' (fewest black keys)' : ''}</option>
                  ))}
                </select>
              </label>
            </div>
            <Slider label="Volume" value={masterVolume} onChange={(v) => useSettings.getState().set({ masterVolume: v })} />
          </section>

          {isPractice && (
            <section className="panel p-4" aria-label="Playability report">
              <div className="panel-title mb-2">Playability on your keyboard</div>
              {warnings.length === 0 ? (
                <p className="text-xs text-good">Every note fits your laptop keys as written.</p>
              ) : (
                <ul className="space-y-1.5 text-xs leading-relaxed text-amber-100/90">
                  {warnings.map((w) => <li key={w} className="flex gap-2"><span className="text-accent">!</span>{w}</li>)}
                </ul>
              )}
              <p className="mt-2 text-[11px] text-zinc-500">
                Original range {midiToName(plan.report.lowest)} to {midiToName(plan.report.highest)} · {plan.report.total} notes.
                {' '}The two-hand layout in <Link className="underline hover:text-zinc-300" href="/settings">Settings</Link> gives 2.4 octaves without shifting.
              </p>
            </section>
          )}

          {isPractice && snap.stats && (
            <section className="panel p-4" aria-label="Live feedback" aria-live="off">
              <div className="panel-title mb-2">Live feedback</div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-good/10 p-2 text-good"><div data-testid="stat-correct" className="text-lg font-semibold">{snap.stats.correct}</div>correct</div>
                <div className="rounded-lg bg-bad/10 p-2 text-bad"><div data-testid="stat-wrong" className="text-lg font-semibold">{snap.stats.wrong}</div>wrong</div>
                <div className="rounded-lg bg-white/5 p-2 text-zinc-300"><div className="text-lg font-semibold">{snap.stats.missed}</div>missed</div>
              </div>
              <dl className="mt-3 space-y-1.5 text-xs text-zinc-400">
                <div className="flex justify-between"><dt>Completion</dt><dd className="font-mono text-zinc-200">{snap.stats.completion}%</dd></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-ink-600"><div className="h-full bg-accent transition-all" style={{ width: `${snap.stats.completion}%` }} /></div>
                <div className="flex justify-between"><dt>Accuracy</dt><dd className="font-mono text-zinc-200">{snap.stats.accuracy}%</dd></div>
                {!wait && <div className="flex justify-between"><dt>Timing error</dt><dd className="font-mono text-zinc-200">{snap.stats.meanErrorMs} ms</dd></div>}
                <div className="flex justify-between"><dt>Score</dt><dd className="font-mono text-accent-soft">{snap.stats.score}%</dd></div>
              </dl>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
