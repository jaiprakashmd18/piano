import { Chord, chordPitchClasses, degreeOffset, CHORD_INTERVALS } from '@/lib/music/chords';
import type { DrumHit } from './drumSynth';
import { engine } from './engine';
import { DrumPattern, StyleDef, Variation, resolveVariation, styleById, styleInstruments } from './styles';
import { ticker } from './ticker';

export type Section = 'stopped' | 'intro' | 'main' | 'fill' | 'break' | 'ending';

export interface ArrangerState {
  running: boolean;
  section: Section;
  /** 0..3 = Main A..D */
  variation: number;
  pendingVariation: number | null;
  syncArmed: boolean;
  styleId: string;
  bpm: number;
  metronome: boolean;
  chord: Chord | null;
  bar: number;
  /** Beat within the bar, 0-based; -1 when idle. */
  beat: number;
  loading: boolean;
  error: string | null;
}

export const BPM_MIN = 40;
export const BPM_MAX = 240;

const LOOKAHEAD = 0.12;
const VEL: Record<string, number> = { x: 0.72, X: 1, o: 0.32 };

/** Places a pitch class in the octave starting at `low`. */
function inRange(pc: number, low: number): number {
  return low + ((((pc - low) % 12) + 12) % 12);
}

/** Number of '-' hold characters following position `i`. */
function holdSteps(pattern: string, i: number): number {
  let n = 0;
  for (let k = i + 1; k < pattern.length && pattern[k] === '-'; k++) n++;
  return n;
}

/**
 * The arranger sequencer. A look-ahead scheduler turns pattern steps into
 * events on the audio clock; nothing here depends on React rendering.
 */
export class Arranger {
  state: ArrangerState = {
    running: false,
    section: 'stopped',
    variation: 0,
    pendingVariation: null,
    syncArmed: false,
    styleId: 'pop',
    bpm: 112,
    metronome: false,
    chord: null,
    bar: 0,
    beat: -1,
    loading: false,
    error: null,
  };

  private listeners = new Set<() => void>();
  private untick: (() => void) | null = null;
  private style: StyleDef = styleById('pop');
  private pendingStyle: StyleDef | null = null;
  private step = 0;
  private nextTime = 0;
  private introBars = 0;
  private endingRequested = false;
  private breakRequested = false;
  private padNotes: number[] = [];
  private padChordKey = '';
  private padInst = '';
  private taps: number[] = [];
  private uiTimers = new Set<ReturnType<typeof setTimeout>>();

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = (): ArrangerState => this.state;

  private set(patch: Partial<ArrangerState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  /** Applies a state change when the audio clock reaches `time`, keeping LEDs in sync with sound. */
  private setAt(time: number, patch: Partial<ArrangerState>): void {
    const ms = Math.max(0, (time - engine.now()) * 1000);
    const id = setTimeout(() => {
      this.uiTimers.delete(id);
      this.set(patch);
    }, ms);
    this.uiTimers.add(id);
  }

  // --------------------------------------------------------------- set-up

  async setStyle(id: string, adoptTempo = true): Promise<void> {
    const style = styleById(id);
    this.set({ styleId: style.id, loading: true, error: null, ...(adoptTempo && !this.state.running ? { bpm: style.bpm } : {}) });
    try {
      await engine.loadAccompaniment(styleInstruments(style));
    } catch (e) {
      this.set({ loading: false, error: e instanceof Error ? e.message : String(e) });
      return;
    }
    if (this.state.styleId !== style.id) return;
    if (this.state.running) this.pendingStyle = style;
    else this.style = style;
    this.set({ loading: false });
  }

  /** Loads the current style's instruments (call once audio has started). */
  prepare(): Promise<void> {
    return this.setStyle(this.state.styleId, false);
  }

  setBpm(bpm: number): void {
    this.set({ bpm: Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(bpm))) });
  }

  nudgeBpm(delta: number): void {
    this.setBpm(this.state.bpm + delta);
  }

  /** Call on every tap; returns the detected tempo once two taps are in. */
  tapTempo(nowMs = performance.now()): number | null {
    if (this.taps.length && nowMs - this.taps[this.taps.length - 1] > 2000) this.taps = [];
    this.taps.push(nowMs);
    if (this.taps.length > 6) this.taps.shift();
    if (this.taps.length < 2) return null;
    const span = this.taps[this.taps.length - 1] - this.taps[0];
    const bpm = 60000 / (span / (this.taps.length - 1));
    this.setBpm(bpm);
    return this.state.bpm;
  }

  setChord(chord: Chord | null): void {
    this.set({ chord });
    if (chord && this.state.syncArmed) this.start();
  }

  /** Any melody key counts as the trigger for Sync Start. */
  notifyUserNote(): void {
    if (this.state.syncArmed) this.start();
  }

  // ------------------------------------------------------------ transport

  private ensureTicking(): void {
    if (!this.untick) this.untick = ticker.add(this.tick);
  }

  private maybeStopTicking(): void {
    if (!this.state.running && !this.state.metronome && this.untick) {
      this.untick();
      this.untick = null;
    }
  }

  start(withIntro = false): void {
    if (!engine.ready || this.state.running) return;
    this.step = 0;
    this.nextTime = engine.now() + 0.06;
    this.introBars = withIntro ? 1 : 0;
    this.endingRequested = false;
    this.breakRequested = false;
    this.set({ running: true, section: withIntro ? 'intro' : 'main', syncArmed: false, bar: 0, beat: -1, pendingVariation: null });
    this.ensureTicking();
  }

  stop(): void {
    for (const id of this.uiTimers) clearTimeout(id);
    this.uiTimers.clear();
    this.releasePad(engine.now());
    engine.silenceAccompaniment();
    this.set({ running: false, section: 'stopped', syncArmed: false, beat: -1, pendingVariation: null });
    this.maybeStopTicking();
  }

  toggle(): void {
    if (this.state.running) this.stop();
    else this.start();
  }

  syncStart(): void {
    if (this.state.running) return;
    this.set({ syncArmed: !this.state.syncArmed });
  }

  intro(): void {
    if (!this.state.running) this.start(true);
  }

  fill(): void {
    if (this.state.running && (this.state.section === 'main' || this.state.section === 'intro')) this.set({ section: 'fill' });
  }

  breakBar(): void {
    if (this.state.running) this.breakRequested = true;
  }

  ending(): void {
    if (this.state.running) this.endingRequested = true;
  }

  /** While playing, a variation change is announced by a fill and lands on the next bar. */
  setVariation(index: number): void {
    const v = Math.max(0, Math.min(3, index));
    if (!this.state.running) {
      this.set({ variation: v });
    } else if (v !== this.state.variation) {
      this.set({ pendingVariation: v, section: this.state.section === 'main' ? 'fill' : this.state.section });
    }
  }

  setMetronome(on: boolean, startTime?: number): void {
    if (on && !this.state.running) {
      this.step = 0;
      this.nextTime = startTime ?? engine.now() + 0.05;
    }
    this.set({ metronome: on });
    if (on) this.ensureTicking();
    else this.maybeStopTicking();
  }

  // ------------------------------------------------------------ scheduler

  private stepDuration(): number {
    return 60 / this.state.bpm / this.style.stepsPerBeat;
  }

  private tick = (): void => {
    if (!engine.ready) return;
    const now = engine.now();
    // After a long stall (sleep, heavy tab throttling) jump forward instead of bursting.
    if (this.nextTime < now - 0.25) this.nextTime = now + 0.02;
    let guard = 0;
    while (this.nextTime < now + LOOKAHEAD && guard++ < 64) {
      if (!this.state.running && !this.state.metronome) break;
      this.scheduleStep(this.step, this.nextTime);
      this.nextTime += this.stepDuration();
      this.step = (this.step + 1) % this.style.stepsPerBar;
    }
  };

  private scheduleStep(step: number, time: number): void {
    const st = this.state;
    const style = this.style;
    const onBeat = step % style.stepsPerBeat === 0;
    const beat = Math.floor(step / style.stepsPerBeat);

    if (st.metronome && onBeat) engine.drum(beat === 0 ? 'clickHi' : 'clickLo', 0.8, time);
    if (!st.running) {
      if (onBeat) this.setAt(time, { beat });
      return;
    }

    let section = st.section;
    let variation = st.variation;
    if (step === 0) {
      let pendingVariation = st.pendingVariation;
      if (section === 'ending') {
        this.stop();
        this.finalHit(time);
        return;
      }
      if (section === 'intro' && --this.introBars < 0) section = 'main';
      else if (section === 'fill' || section === 'break') {
        section = 'main';
        if (pendingVariation !== null) {
          variation = pendingVariation;
          pendingVariation = null;
        }
      }
      if (this.pendingStyle) {
        this.style = this.pendingStyle;
        this.pendingStyle = null;
      }
      if (this.endingRequested) {
        section = 'ending';
        this.endingRequested = false;
      } else if (this.breakRequested) {
        section = 'break';
        this.breakRequested = false;
      }
      // Scheduling state must be current immediately; the UI copy follows on the beat.
      this.state = { ...this.state, section, variation, pendingVariation, bar: st.bar + 1 };
      this.setAt(time, { beat: 0 });
    } else if (onBeat) {
      this.setAt(time, { beat });
    }

    const dur = this.stepDuration();
    const swung = this.style.swing > 0 && step % 2 === 1 ? time + this.style.swing * dur : time;
    const v = resolveVariation(this.style, variation);

    this.playDrums(section, v, step, swung, onBeat);
    const chord = this.state.chord;
    if (!chord || section === 'intro' || section === 'break') {
      if (this.padNotes.length) this.releasePad(time);
      return;
    }
    const sparse = section === 'fill' || section === 'ending';
    this.playBass(section === 'ending' ? '1' + '-'.repeat(this.style.stepsPerBar - 1) : v.bass, chord, step, swung, dur);
    if (!sparse) {
      this.playKeys(v.keys, chord, step, swung, dur);
      if (this.style.guitarInst) this.playGuitar(v.guitar, chord, step, swung, dur);
    } else if (section === 'ending' && step === 0) {
      for (const m of this.voicing(chord, 55)) engine.accompNote(this.style.keysInst, m, 0.6, dur * this.style.stepsPerBar, time);
    }
    this.playPad(Boolean(v.pad) || section === 'ending', chord, step, time);
  }

  private playDrums(section: Section, v: Variation, step: number, time: number, onBeat: boolean): void {
    let pattern: DrumPattern;
    if (section === 'intro') {
      if (onBeat) engine.drum('stick', 0.9, time);
      return;
    }
    if (section === 'break') {
      if (step === 0) {
        engine.drum('kick', 0.9, time);
        engine.drum('crash', 0.5, time);
      }
      return;
    }
    if (section === 'fill' || section === 'ending') pattern = this.style.fill;
    else pattern = v.drums;
    for (const hit in pattern) {
      const c = pattern[hit as DrumHit]![step];
      const vel = VEL[c];
      if (vel) engine.drum(hit as DrumHit, vel * (0.94 + Math.random() * 0.1), time);
    }
  }

  private playBass(pattern: string | undefined, chord: Chord, step: number, time: number, dur: number): void {
    if (!pattern) return;
    const c = pattern[step];
    if (c === '.' || c === '-' || c === undefined) return;
    const root = inRange(chord.root, 31);
    let midi: number;
    if (c === '1') midi = inRange(chord.bass ?? chord.root, 31);
    else if (c === 'v') midi = root - 5;
    else midi = root + degreeOffset(chord.quality, Number(c));
    engine.accompNote('bass', midi, 0.85, dur * (1 + holdSteps(pattern, step)) * 0.95, time);
  }

  private voicing(chord: Chord, low: number): number[] {
    return chordPitchClasses(chord)
      .map((pc) => inRange(pc, low))
      .sort((a, b) => a - b);
  }

  private playKeys(pattern: string | undefined, chord: Chord, step: number, time: number, dur: number): void {
    if (!pattern) return;
    const c = pattern[step];
    if (c === '.' || c === '-' || c === undefined) return;
    const hold = holdSteps(pattern, step);
    const inst = this.style.keysInst;
    if (c === 'x' || c === 'X') {
      const length = hold > 0 ? dur * (1 + hold) * 0.95 : dur * 1.6;
      for (const m of this.voicing(chord, 55)) engine.accompNote(inst, m, c === 'X' ? 0.75 : 0.55, length, time);
    } else {
      const root = inRange(chord.root, 55);
      const midi = root + degreeOffset(chord.quality, Number(c));
      engine.accompNote(inst, midi, 0.6, dur * (2 + hold), time);
    }
  }

  private playGuitar(pattern: string | undefined, chord: Chord, step: number, time: number, dur: number): void {
    if (!pattern) return;
    const c = pattern[step];
    if (c !== 'd' && c !== 'u' && c !== 'm') return;
    const inst = this.style.guitarInst!;
    const iv = CHORD_INTERVALS[chord.quality];
    const r = inRange(chord.root, 43);
    const shape = [r, r + iv[2], r + 12, r + 12 + iv[1], r + 12 + iv[2]];
    const hold = holdSteps(pattern, step);
    if (c === 'm') {
      shape.forEach((m, i) => engine.accompNote(inst, m, 0.4, 0.05, time + i * 0.004));
    } else if (c === 'd') {
      shape.forEach((m, i) => engine.accompNote(inst, m, 0.62, Math.max(0.5, dur * (1 + hold)), time + i * 0.013));
    } else {
      shape
        .slice(2)
        .reverse()
        .forEach((m, i) => engine.accompNote(inst, m, 0.45, Math.max(0.35, dur * (1 + hold)), time + i * 0.01));
    }
  }

  private playPad(enabled: boolean, chord: Chord, step: number, time: number): void {
    const key = `${chord.root}:${chord.quality}`;
    if (!enabled) {
      if (this.padNotes.length) this.releasePad(time);
      return;
    }
    if (step !== 0 && key === this.padChordKey && this.padNotes.length) return;
    this.releasePad(time);
    const inst = this.style.padInst;
    const notes = this.style.drone
      ? [inRange(chord.root, 48), inRange(chord.root, 48) + 7, inRange(chord.root, 48) + 12]
      : [inRange(chord.root, 40), ...this.voicing(chord, 52)];
    for (const m of notes) engine.accompAttack(inst, m, 0.42, time);
    this.padNotes = notes;
    this.padChordKey = key;
    this.padInst = inst;
  }

  private releasePad(time: number): void {
    for (const m of this.padNotes) engine.accompRelease(this.padInst, m, time);
    this.padNotes = [];
    this.padChordKey = '';
  }

  private finalHit(time: number): void {
    engine.drum('kick', 1, time);
    engine.drum('crash', 0.9, time);
    const chord = this.state.chord;
    if (!chord) return;
    engine.accompNote('bass', inRange(chord.root, 31), 0.9, 1.6, time);
    for (const m of this.voicing(chord, 55)) engine.accompNote(this.style.keysInst, m, 0.8, 1.8, time);
  }
}

export const arranger = new Arranger();
