/**
 * Deterministic performance scoring. Works purely on song time (seconds), so
 * it behaves identically at any practice speed and is trivially testable.
 */

export interface Target {
  id: number;
  midi: number;
  time: number;
}

export type Grade = 'perfect' | 'good' | 'ok';
export type TargetState = 'pending' | Grade | 'missed';

export interface PressResult {
  kind: 'hit' | 'wrong';
  id?: number;
  grade?: Grade;
  /** Signed timing error in seconds (negative = early). */
  error?: number;
}

export interface Stats {
  total: number;
  correct: number;
  perfect: number;
  good: number;
  ok: number;
  wrong: number;
  missed: number;
  /** Mean absolute timing error of hits, in milliseconds. */
  meanErrorMs: number;
  /** Share of hits that were early (0..1); 0.5 means centred. */
  earlyRatio: number;
  /** 0..100: how much of the passage has been judged. */
  completion: number;
  /** 0..100: share of judged notes that were hit. */
  accuracy: number;
  /** 0..100 overall practice score. */
  score: number;
}

const GRADE_POINTS: Record<Grade, number> = { perfect: 100, good: 80, ok: 60 };
const WRONG_PENALTY = 25;

export class Evaluator {
  readonly targets: Target[];
  private state: TargetState[];
  private errors: number[] = [];
  private wrong = 0;
  /** Index of the first target that may still be pending. */
  private cursor = 0;
  private indexById = new Map<number, number>();

  constructor(
    targets: Target[],
    /** Maximum |timing error| in song seconds that still counts as a hit. */
    public tolerance = 0.3,
  ) {
    this.targets = [...targets].sort((a, b) => a.time - b.time);
    this.state = this.targets.map(() => 'pending');
    this.targets.forEach((t, i) => this.indexById.set(t.id, i));
  }

  stateOf(id: number): TargetState {
    const i = this.indexById.get(id);
    return i === undefined ? 'pending' : this.state[i];
  }

  /** Clears judgements for targets at or after `from` (used by seek / loop). */
  reset(from = 0, to = Infinity): void {
    this.targets.forEach((t, i) => {
      if (t.time >= from && t.time < to) this.state[i] = 'pending';
    });
    if (from === 0 && to === Infinity) {
      this.errors = [];
      this.wrong = 0;
    }
    this.cursor = 0;
  }

  private grade(absErr: number): Grade {
    if (absErr <= this.tolerance * 0.34) return 'perfect';
    if (absErr <= this.tolerance * 0.67) return 'good';
    return 'ok';
  }

  /** The learner pressed `midi` at song time `t`. */
  press(midi: number, t: number): PressResult {
    let bestI = -1;
    let bestErr = Infinity;
    for (let i = this.cursor; i < this.targets.length; i++) {
      const tg = this.targets[i];
      if (tg.time - t > this.tolerance) break;
      if (this.state[i] !== 'pending' || tg.midi !== midi) continue;
      const err = Math.abs(t - tg.time);
      if (err <= this.tolerance && err < bestErr) {
        bestErr = err;
        bestI = i;
      }
    }
    if (bestI < 0) {
      this.wrong++;
      return { kind: 'wrong' };
    }
    const error = t - this.targets[bestI].time;
    const grade = this.grade(bestErr);
    this.state[bestI] = grade;
    this.errors.push(error);
    return { kind: 'hit', id: this.targets[bestI].id, grade, error };
  }

  /** Marks a target as hit regardless of timing (Wait Mode). */
  hitDirect(id: number, grade: Grade = 'good'): void {
    const i = this.indexById.get(id);
    if (i !== undefined && this.state[i] === 'pending') this.state[i] = grade;
  }

  countWrong(): void {
    this.wrong++;
  }

  /** Advances the clock; returns ids that just became missed. */
  advance(t: number): number[] {
    const missed: number[] = [];
    for (let i = this.cursor; i < this.targets.length; i++) {
      const tg = this.targets[i];
      if (tg.time + this.tolerance >= t) break;
      if (this.state[i] === 'pending') {
        this.state[i] = 'missed';
        missed.push(tg.id);
      }
    }
    while (this.cursor < this.targets.length && this.state[this.cursor] !== 'pending') this.cursor++;
    return missed;
  }

  stats(from = -Infinity, to = Infinity): Stats {
    let perfect = 0;
    let good = 0;
    let ok = 0;
    let missed = 0;
    let total = 0;
    this.targets.forEach((t, i) => {
      if (t.time < from || t.time >= to) return;
      total++;
      const s = this.state[i];
      if (s === 'perfect') perfect++;
      else if (s === 'good') good++;
      else if (s === 'ok') ok++;
      else if (s === 'missed') missed++;
    });
    const correct = perfect + good + ok;
    const judged = correct + missed;
    const points = perfect * GRADE_POINTS.perfect + good * GRADE_POINTS.good + ok * GRADE_POINTS.ok;
    const raw = judged === 0 ? 0 : (points - this.wrong * WRONG_PENALTY) / judged;
    const abs = this.errors.map(Math.abs);
    return {
      total,
      correct,
      perfect,
      good,
      ok,
      wrong: this.wrong,
      missed,
      meanErrorMs: abs.length ? Math.round((abs.reduce((a, b) => a + b, 0) / abs.length) * 1000) : 0,
      earlyRatio: this.errors.length ? this.errors.filter((e) => e < 0).length / this.errors.length : 0.5,
      completion: total === 0 ? 0 : Math.round((judged / total) * 100),
      accuracy: judged === 0 ? 0 : Math.round((correct / judged) * 100),
      score: Math.max(0, Math.min(100, Math.round(raw))),
    };
  }
}
