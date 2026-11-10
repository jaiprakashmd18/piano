import { describe, expect, it } from 'vitest';
import { builtinSongs } from '@/data/songs';
import { presetById } from '@/lib/input/keymap';
import { Evaluator } from '@/lib/learn/evaluator';
import { buildMappingPlan, describeReport, groupChords, suggestTransposition } from '@/lib/learn/mapping';
import { Tutor, TutorIO, TutorOptions, splitPhrases } from '@/lib/learn/tutor';
import type { SongNote } from '@/lib/learn/types';

const classic = presetById('classic').mapping;
const twoRow = presetById('two-row').mapping;
const note = (midi: number, time: number, hand: 'left' | 'right' = 'right', duration = 0.4): SongNote => ({ midi, time, duration, velocity: 0.8, hand });

describe('song to laptop-key mapping', () => {
  it('maps in-range notes straight to their keys', () => {
    const plan = buildMappingPlan([note(60, 0), note(64, 1), note(72, 2)], classic, { mode: 'fold', transpose: 0 });
    expect(plan.notes.map((n) => n.code)).toEqual(['KeyA', 'KeyD', 'KeyK']);
    expect(plan.report.folded).toBe(0);
    expect(describeReport(plan.report, 'fold')).toEqual([]);
  });
  it('folds out-of-range notes and reports it instead of dropping them', () => {
    const plan = buildMappingPlan([note(60, 0), note(62, 1), note(36, 2), note(96, 3)], classic, { mode: 'fold', transpose: 0 });
    expect(plan.notes.length).toBe(4);
    expect(plan.report.folded).toBe(2);
    expect(plan.notes[2].playMidi % 12).toBe(0);
    expect(plan.notes.every((n) => n.code !== null)).toBe(true);
    expect(describeReport(plan.report, 'fold').join(' ')).toMatch(/outside the laptop range/);
  });
  it('follows the music with octave cues in auto mode', () => {
    const low = [0, 1, 2, 3].map((i) => note(36 + i * 2, i));
    const high = [4, 5, 6, 7].map((i) => note(84 + (i - 4) * 2, i));
    const plan = buildMappingPlan([...low, ...high], classic, { mode: 'auto', transpose: 0 });
    expect(plan.report.folded).toBe(0);
    expect(plan.report.octaveChanges).toBe(1);
    expect(plan.shifts.map((s) => s.shift)).toEqual([-2, 2]);
    expect(plan.notes[0].code).toBe('KeyA');
    expect(plan.notes[4].code).toBe('KeyA');
  });
  it('flags chords that collapse onto one key or exceed keyboard rollover', () => {
    const octaves = buildMappingPlan([note(36, 0), note(60, 0)], classic, { mode: 'fold', transpose: 0 });
    expect(octaves.report.duplicates).toBe(1);
    expect(octaves.notes.filter((n) => n.assisted).length).toBe(1);
    const big = buildMappingPlan([60, 64, 67, 71, 72].map((m) => note(m, 0)), classic, { mode: 'fold', transpose: 0 });
    expect(big.report.heavyChords).toBe(1);
    expect(big.report.maxKeysAtOnce).toBe(5);
    const thin = buildMappingPlan([60, 64, 67, 71, 72].map((m) => note(m, 0)), classic, { mode: 'fold', transpose: 0, maxSimultaneous: 2 });
    expect(thin.report.assisted).toBe(3);
    const kept = thin.notes.filter((n) => !n.assisted).map((n) => n.playMidi);
    expect(kept).toEqual([60, 72]);
    expect(thin.notes.length).toBe(5);
  });
  it('the two-row layout fits two-hand pieces with far less folding', () => {
    const song = builtinSongs().find((s) => s.id === 'ode-to-joy')!;
    const a = buildMappingPlan(song.notes, classic, { mode: 'fold', transpose: 0 });
    const b = buildMappingPlan(song.notes, twoRow, { mode: 'fold', transpose: 0 });
    expect(b.report.folded).toBeLessThan(a.report.folded);
  });
  it('every built-in song maps without losing a note', () => {
    for (const song of builtinSongs()) {
      for (const mode of ['fold', 'auto', 'manual'] as const) {
        const plan = buildMappingPlan(song.notes, classic, { mode, transpose: 0 });
        expect(plan.notes.length).toBe(song.notes.length);
        expect(plan.report.unmapped).toBe(0);
        for (const n of plan.notes) if (!n.assisted) expect(n.code, `${song.id} ${n.midi}`).not.toBeNull();
      }
    }
  });
  it('suggests a white-key friendly transposition', () => {
    const fSharpMajor = [66, 68, 70, 71, 73, 75, 77].map((m, i) => note(m, i));
    const t = suggestTransposition(fSharpMajor);
    expect(fSharpMajor.every((n) => ![1, 3, 6, 8, 10].includes((n.midi + t) % 12))).toBe(true);
    expect(suggestTransposition([note(60, 0), note(64, 1)])).toBe(0);
  });
  it('groups simultaneous notes', () => {
    expect(groupChords([{ time: 0 }, { time: 0.01 }, { time: 0.5 }])).toEqual([[0, 1], [2]]);
  });
});

describe('evaluator', () => {
  const targets = [
    { id: 0, midi: 60, time: 1 },
    { id: 1, midi: 62, time: 2 },
    { id: 2, midi: 64, time: 3 },
    { id: 3, midi: 65, time: 4 },
  ];
  it('grades timing, wrong notes and misses deterministically', () => {
    const ev = new Evaluator(targets, 0.3);
    expect(ev.press(60, 1.02)).toMatchObject({ kind: 'hit', grade: 'perfect' });
    expect(ev.press(62, 2.15)).toMatchObject({ kind: 'hit', grade: 'good' });
    expect(ev.press(61, 2.5).kind).toBe('wrong');
    expect(ev.press(64, 2.75)).toMatchObject({ kind: 'hit', grade: 'ok' });
    expect(ev.press(64, 3.0).kind).toBe('wrong'); // already used
    expect(ev.advance(5)).toEqual([3]);
    const s = ev.stats();
    expect(s).toMatchObject({ total: 4, correct: 3, wrong: 2, missed: 1, completion: 100, accuracy: 75 });
    expect(s.score).toBe(Math.round((100 + 80 + 60 - 50) / 4));
    expect(s.meanErrorMs).toBeGreaterThan(0);
  });
  it('rejects presses outside the tolerance window', () => {
    const ev = new Evaluator(targets, 0.3);
    expect(ev.press(60, 0.5).kind).toBe('wrong');
    expect(ev.press(60, 1.31).kind).toBe('wrong');
    expect(ev.press(60, 1.29).kind).toBe('hit');
  });
  it('can re-judge a region after a loop', () => {
    const ev = new Evaluator(targets, 0.3);
    ev.press(60, 1);
    ev.advance(10);
    ev.reset(2, 4);
    expect(ev.stats().missed).toBe(1);
    expect(ev.press(62, 2).kind).toBe('hit');
  });
});

class FakeIO implements TutorIO {
  t = 0;
  played: { midi: number; when: number }[] = [];
  shifts: number[] = [];
  now() { return this.t; }
  play(midi: number, _v: number, _d: number, when: number) { this.played.push({ midi, when }); }
  cancel() {}
  setShift(s: number) { this.shifts.push(s); }
}

function makeTutor(notes: SongNote[], opts: Partial<TutorOptions>, io = new FakeIO()) {
  const options: TutorOptions = { hands: ['right'], wait: false, speed: 1, loop: null, step: false, shiftMode: 'fold', backing: true, ...opts };
  const mine = options.hands.length ? notes.filter((n) => options.hands.includes(n.hand)) : notes;
  const rest = options.hands.length ? notes.filter((n) => !options.hands.includes(n.hand)) : [];
  const plan = buildMappingPlan(mine, classic, { mode: 'fold', transpose: 0 });
  const duration = Math.max(...notes.map((n) => n.time + n.duration));
  const tutor = new Tutor(plan, rest, duration, splitPhrases(notes, 2, duration, 1), options, io);
  return { tutor, io };
}

function run(tutor: Tutor, io: FakeIO, until: number, onStep?: (t: number) => void) {
  while (io.t < until) {
    io.t = +(io.t + 0.025).toFixed(3);
    tutor.update();
    onStep?.(io.t);
  }
}

describe('tutor', () => {
  const melody = [note(60, 0.5), note(62, 1), note(64, 1.5), note(48, 0.5, 'left'), note(52, 1.5, 'left')];

  it('wait mode holds the clock until the right key is pressed', () => {
    const { tutor, io } = makeTutor(melody, { wait: true });
    tutor.play();
    run(tutor, io, 3);
    expect(tutor.waiting).toBe(true);
    expect(tutor.time()).toBeCloseTo(0.5, 5);
    expect(io.played.length).toBe(0); // backing waits too
    expect(tutor.onUserNote(61).kind).toBe('wrong');
    expect(tutor.time()).toBeCloseTo(0.5, 5);
    expect(tutor.onUserNote(60).kind).toBe('hit');
    expect(tutor.waiting).toBe(false);
    run(tutor, io, 3.3);
    expect(tutor.time()).toBeGreaterThan(0.5);
    run(tutor, io, 6);
    expect(tutor.time()).toBeCloseTo(1, 5); // waiting on the next note
    tutor.onUserNote(62);
    run(tutor, io, 9);
    tutor.onUserNote(64);
    run(tutor, io, 12);
    expect(tutor.finished).toBe(true);
    expect(tutor.stats()).toMatchObject({ correct: 3, wrong: 1, missed: 0, completion: 100 });
    expect(io.played.map((p) => p.midi)).toEqual([48, 52]); // left-hand backing at its true pitch
  });

  it('scores a timed performance and marks missed notes', () => {
    const { tutor, io } = makeTutor(melody, {});
    tutor.play();
    run(tutor, io, 4, (t) => {
      // song time lags audio by the 50 ms start offset
      if (Math.abs(t - 0.55) < 1e-6) tutor.onUserNote(60);
      if (Math.abs(t - 1.15) < 1e-6) tutor.onUserNote(62);
    });
    const s = tutor.stats();
    expect(s.correct).toBe(2);
    expect(s.missed).toBe(1);
    expect(tutor.finished).toBe(true);
  });

  it('plays only the selected hand and half speed halves the clock', () => {
    const { tutor, io } = makeTutor(melody, { hands: ['left'], speed: 0.5, backing: false });
    tutor.play();
    run(tutor, io, 1.05);
    expect(tutor.time()).toBeCloseTo(0.5, 1);
    expect(io.played.length).toBe(0);
    expect(tutor.evaluator.targets.length).toBe(2);
  });

  it('demo mode plays every note at the right audio time', () => {
    const { tutor, io } = makeTutor(melody, { hands: [] });
    tutor.play();
    run(tutor, io, 4);
    expect(io.played.length).toBe(5);
    const first = io.played.find((p) => p.midi === 62)!;
    expect(first.when).toBeCloseTo(1.05, 2);
    expect(tutor.onUserNote(60).kind).toBe('ignored');
  });

  it('step mode repeats a phrase until it is played well, then advances', () => {
    const notes = [note(60, 0.5), note(62, 1), note(64, 2.5), note(65, 3)];
    const { tutor, io } = makeTutor(notes, { step: true });
    expect(tutor.phrases.length).toBe(2);
    tutor.play();
    run(tutor, io, 2.2); // play nothing: phrase 1 fails
    expect(tutor.phraseIndex).toBe(0);
    expect(tutor.lastPhraseAccuracy).toBe(0);
    const base = io.t;
    run(tutor, io, base + 2.3, () => {
      const t = tutor.time();
      if (Math.abs(t - 0.5) < 0.013) tutor.onUserNote(60);
      if (Math.abs(t - 1.0) < 0.013) tutor.onUserNote(62);
    });
    expect(tutor.phraseIndex).toBe(1);
  });

  it('loop mode returns to the start of the loop', () => {
    const { tutor, io } = makeTutor(melody, { hands: [], loop: { from: 0.4, to: 1.2 } });
    tutor.play();
    run(tutor, io, 3);
    expect(tutor.finished).toBe(false);
    expect(tutor.time()).toBeLessThan(1.25);
    expect(io.played.filter((p) => p.midi === 62).length).toBeGreaterThan(1);
  });
});
