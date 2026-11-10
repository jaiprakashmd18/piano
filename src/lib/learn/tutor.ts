import { Evaluator, Grade, Stats } from './evaluator';
import { CHORD_EPS, MappedNote, MappingMode, MappingPlan } from './mapping';
import type { Hand, SongNote } from './types';

export interface TutorIO {
  /** Audio-clock seconds. */
  now(): number;
  play(midi: number, velocity: number, duration: number, when: number): void;
  cancel(): void;
  /** Auto octave mode: move the laptop keyboard to this octave shift. */
  setShift(shift: number): void;
}

export interface Phrase {
  from: number;
  to: number;
}

export interface TutorOptions {
  /** Hands the learner plays; empty = listen to the demo. */
  hands: Hand[];
  /** Pause at each note until the right key is pressed. */
  wait: boolean;
  speed: number;
  loop: Phrase | null;
  /** Phrase-by-phrase teaching: repeat each phrase until it is played well. */
  step: boolean;
  shiftMode: MappingMode;
  /** The app plays the hand(s) you are not practising. */
  backing: boolean;
}

export interface Feedback {
  kind: 'hit' | 'wrong' | 'ignored';
  id?: number;
  grade?: Grade;
  error?: number;
}

/** A note the app plays itself, at its original pitch. */
interface AutoNote {
  time: number;
  midi: number;
  velocity: number;
  duration: number;
}

interface Group {
  time: number;
  ids: number[];
  pending: Set<number>;
}

const LOOKAHEAD = 0.15;
/** Accuracy needed to move on in step-by-step mode. */
export const PHRASE_PASS = 80;

/** Cuts a song into phrases of `bars` bars, skipping empty ones. */
export function splitPhrases(notes: SongNote[], barSeconds: number, duration: number, bars = 2): Phrase[] {
  const len = barSeconds * bars;
  const out: Phrase[] = [];
  if (len <= 0) return out;
  for (let from = 0; from < duration - 1e-6; from += len) {
    const to = Math.min(duration, from + len);
    if (notes.some((n) => n.time >= from - 1e-6 && n.time < to - 1e-6)) out.push({ from, to });
  }
  return out;
}

/**
 * Deterministic tutor state machine. It owns the song clock (derived from the
 * audio clock), schedules the notes the app plays, and judges the learner.
 * Rendering code only reads `time()` and note states.
 */
export class Tutor {
  readonly evaluator: Evaluator;
  playing = false;
  waiting = false;
  finished = false;
  phraseIndex = 0;
  /** Last completed phrase's accuracy (step mode), for the UI. */
  lastPhraseAccuracy: number | null = null;

  private anchorSong = 0;
  private anchorAudio = 0;
  private groups: Group[] = [];
  private gi = 0;
  private auto: AutoNote[] = [];
  private ai = 0;
  private si = 0;
  private targetById = new Map<number, MappedNote>();

  /**
   * @param plan    keyboard mapping of the notes the learner plays (all notes for a demo)
   * @param backing the remaining notes; played by the app when `options.backing` is on
   */
  constructor(
    readonly plan: MappingPlan,
    backing: SongNote[],
    readonly duration: number,
    readonly phrases: Phrase[],
    public options: TutorOptions,
    private io: TutorIO,
  ) {
    const hands = new Set(options.hands);
    const targets: MappedNote[] = [];
    const transpose = plan.report.transpose;
    for (const n of plan.notes) {
      const mine = hands.has(n.hand) && !n.assisted && n.code !== null;
      if (mine) targets.push(n);
      // Anything the learner cannot or need not play sounds at its true pitch.
      else this.auto.push({ time: n.time, midi: n.midi + transpose, velocity: n.velocity, duration: n.duration });
    }
    if (options.backing || hands.size === 0) {
      for (const n of backing) this.auto.push({ time: n.time, midi: n.midi + transpose, velocity: n.velocity, duration: n.duration });
    }
    this.auto.sort((a, b) => a.time - b.time);
    for (const t of targets) this.targetById.set(t.index, t);
    this.evaluator = new Evaluator(
      targets.map((t) => ({ id: t.index, midi: t.playMidi, time: t.time })),
      0.3,
    );
    let last: Group | null = null;
    for (const t of targets) {
      if (!last || t.time - last.time > CHORD_EPS) {
        last = { time: t.time, ids: [], pending: new Set() };
        this.groups.push(last);
      }
      last.ids.push(t.index);
    }
    this.resetPointers(0);
    if (options.step && phrases.length) this.anchorSong = this.leadIn(phrases[0].from);
    else if (options.loop) this.anchorSong = options.loop.from;
  }

  get isPractice(): boolean {
    return this.options.hands.length > 0;
  }

  /** Current song time in seconds. */
  time(): number {
    if (!this.playing || this.waiting) return this.anchorSong;
    return this.anchorSong + (this.io.now() - this.anchorAudio) * this.options.speed;
  }

  private leadIn(t: number): number {
    return Math.max(0, t - 0.6);
  }

  private region(): Phrase {
    if (this.options.step && this.phrases.length) return this.phrases[Math.min(this.phraseIndex, this.phrases.length - 1)];
    if (this.options.loop) return this.options.loop;
    return { from: 0, to: this.duration + 0.6 };
  }

  private resetPointers(t: number): void {
    this.gi = this.groups.findIndex((g) => g.time >= t - 1e-6);
    if (this.gi < 0) this.gi = this.groups.length;
    for (let i = this.gi; i < this.groups.length; i++) this.groups[i].pending = new Set(this.groups[i].ids);
    this.ai = this.auto.findIndex((n) => n.time >= t - 1e-6);
    if (this.ai < 0) this.ai = this.auto.length;
    // Apply the octave in force at t, then continue from the next cue.
    let shift = this.plan.shifts[0]?.shift ?? 0;
    this.si = 0;
    while (this.si < this.plan.shifts.length && this.plan.shifts[this.si].time <= t + 1e-6) shift = this.plan.shifts[this.si++].shift;
    if (this.options.shiftMode !== 'manual' && this.isPractice) this.io.setShift(shift);
    this.waiting = false;
  }

  play(): void {
    if (this.playing) return;
    if (this.finished) this.seek(this.region().from === 0 ? 0 : this.leadIn(this.region().from));
    this.playing = true;
    this.finished = false;
    this.anchorAudio = this.io.now() + 0.05;
  }

  pause(): void {
    if (!this.playing) return;
    this.anchorSong = this.time();
    this.playing = false;
    this.waiting = false;
    this.io.cancel();
    this.resetPointersKeepJudgements(this.anchorSong);
  }

  private resetPointersKeepJudgements(t: number): void {
    const pending = this.groups.map((g) => g.pending);
    this.resetPointers(t);
    // Notes already hit before the pause stay hit.
    this.groups.forEach((g, i) => {
      if (i >= this.gi) g.pending = new Set([...g.ids].filter((id) => pending[i].has(id)));
    });
  }

  seek(t: number): void {
    const clamped = Math.max(0, Math.min(this.duration, t));
    this.io.cancel();
    this.anchorSong = clamped;
    this.anchorAudio = this.io.now() + 0.05;
    this.finished = false;
    this.evaluator.reset(clamped);
    this.resetPointers(clamped);
  }

  setSpeed(speed: number): void {
    this.anchorSong = this.time();
    this.anchorAudio = this.io.now();
    this.options.speed = speed;
  }

  setLoop(loop: Phrase | null): void {
    this.options.loop = loop;
  }

  /** Advances the state machine; call every ~25 ms while playing. */
  update(): void {
    if (!this.playing) return;
    const now = this.io.now();
    let t = this.time();
    const speed = this.options.speed;
    const group = this.groups[this.gi];

    if (this.options.wait && this.isPractice && group && t >= group.time) {
      t = group.time;
      this.anchorSong = t;
      this.waiting = true;
    }
    if (this.waiting) this.anchorAudio = now;

    // Notes the app plays. While waiting, nothing at or beyond the awaited chord may sound.
    let horizon = t + LOOKAHEAD * speed;
    if (this.options.wait && this.isPractice && group) horizon = Math.min(horizon, group.time - 1e-6);
    horizon = Math.min(horizon, this.region().to);
    while (this.ai < this.auto.length && this.auto[this.ai].time < horizon) {
      const n = this.auto[this.ai++];
      const when = this.anchorAudio + (n.time - this.anchorSong) / speed;
      this.io.play(n.midi, n.velocity, n.duration / speed, when);
    }

    if (this.options.shiftMode !== 'manual' && this.isPractice) {
      while (this.si < this.plan.shifts.length && this.plan.shifts[this.si].time <= t + 0.03) {
        this.io.setShift(this.plan.shifts[this.si++].shift);
      }
    }

    if (!this.options.wait) {
      this.evaluator.advance(t);
      while (this.gi < this.groups.length && this.groups[this.gi].time + this.evaluator.tolerance < t) this.gi++;
    }

    const region = this.region();
    if (t >= region.to && !this.waiting) this.onRegionEnd(region);
  }

  private onRegionEnd(region: Phrase): void {
    if (this.options.step && this.phrases.length) {
      const stats = this.evaluator.stats(region.from, region.to);
      this.lastPhraseAccuracy = stats.accuracy;
      const passed = !this.isPractice || stats.accuracy >= PHRASE_PASS;
      if (passed) {
        if (this.phraseIndex >= this.phrases.length - 1) return this.finish();
        this.phraseIndex++;
      }
      const next = this.phrases[this.phraseIndex];
      this.io.cancel();
      this.anchorSong = this.leadIn(next.from);
      this.anchorAudio = this.io.now() + 0.05;
      this.evaluator.reset(next.from, next.to);
      this.resetPointers(this.anchorSong);
      return;
    }
    if (this.options.loop) {
      this.io.cancel();
      this.anchorSong = this.leadIn(region.from);
      this.anchorAudio = this.io.now() + 0.05;
      this.evaluator.reset(region.from, region.to);
      this.resetPointers(this.anchorSong);
      return;
    }
    this.finish();
  }

  private finish(): void {
    this.anchorSong = Math.min(this.time(), this.duration);
    this.playing = false;
    this.waiting = false;
    this.finished = true;
  }

  /** The learner pressed a key producing `midi`. */
  onUserNote(midi: number): Feedback {
    if (!this.playing || !this.isPractice) return { kind: 'ignored' };
    const t = this.time();
    if (!this.options.wait) {
      const r = this.evaluator.press(midi, t);
      return r.kind === 'hit' ? { kind: 'hit', id: r.id, grade: r.grade, error: r.error } : { kind: 'wrong' };
    }
    const group = this.groups[this.gi];
    const early = group ? group.time - t : Infinity;
    if (group && (this.waiting || early <= 0.35 * this.options.speed)) {
      for (const id of group.pending) {
        if (this.targetById.get(id)!.playMidi !== midi) continue;
        group.pending.delete(id);
        this.evaluator.hitDirect(id, 'perfect');
        if (group.pending.size === 0) {
          // Chord complete: resume exactly from this chord.
          this.gi++;
          this.waiting = false;
          this.anchorSong = group.time;
          this.anchorAudio = this.io.now();
        }
        return { kind: 'hit', id, grade: 'perfect' };
      }
    }
    this.evaluator.countWrong();
    return { kind: 'wrong' };
  }

  /** Keys the learner should press right now (Wait Mode), as note indices. */
  awaited(): number[] {
    const g = this.groups[this.gi];
    return this.waiting && g ? [...g.pending] : [];
  }

  stats(): Stats {
    return this.evaluator.stats();
  }
}
