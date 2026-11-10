import { BASE_C, KeyMapping, codeForMidi, mappedOffsets } from '@/lib/input/keymap';
import { isBlack } from '@/lib/music/notes';
import type { SongNote } from './types';

export type MappingMode = 'fold' | 'auto' | 'manual';

export interface MappingOptions {
  mode: MappingMode;
  /** Semitones added to every note before mapping. */
  transpose: number;
  /** When set, chords larger than this are thinned (extra notes become app-played backing). */
  maxSimultaneous?: number;
}

export interface MappedNote extends SongNote {
  /** Index in the source array. */
  index: number;
  /** Pitch the learner actually plays (after transposition / folding). */
  playMidi: number;
  /** Octave shift that must be active when this note is played. */
  shift: number;
  /** Physical key (KeyboardEvent.code), or null when no key produces this pitch. */
  code: string | null;
  /** Moved by one or more octaves to fit the laptop range. */
  folded: boolean;
  /** Thinned out of an oversized chord; the app plays it instead of the learner. */
  assisted: boolean;
  /** Same key as another note in the same chord after folding. */
  duplicate: boolean;
}

export interface ShiftCue {
  time: number;
  shift: number;
}

export interface MappingReport {
  total: number;
  folded: number;
  unmapped: number;
  duplicates: number;
  assisted: number;
  /** Chords needing more simultaneous keys than typical laptop rollover guarantees. */
  heavyChords: number;
  octaveChanges: number;
  transpose: number;
  baseShift: number;
  /** Largest number of keys that must be held at once. */
  maxKeysAtOnce: number;
  lowest: number;
  highest: number;
}

export interface MappingPlan {
  notes: MappedNote[];
  shifts: ShiftCue[];
  report: MappingReport;
}

/** Notes starting within this many seconds are treated as one chord. */
export const CHORD_EPS = 0.035;
/** Most laptop keyboards reliably register 3 arbitrary letter keys; more may ghost. */
export const SAFE_ROLLOVER = 3;

function windowFor(offsets: number[], shift: number): Set<number> {
  return new Set(offsets.map((o) => BASE_C + shift * 12 + o));
}

function foldInto(midi: number, win: Set<number>, lo: number, hi: number): number | null {
  if (win.has(midi)) return midi;
  let m = midi;
  while (m < lo) m += 12;
  while (m > hi) m -= 12;
  if (win.has(m)) return m;
  // Sparse custom mappings: search neighbouring octaves for the pitch class.
  for (let k = 1; k <= 10; k++) {
    if (win.has(midi + 12 * k)) return midi + 12 * k;
    if (win.has(midi - 12 * k)) return midi - 12 * k;
  }
  return null;
}

/** Groups note indices by (near-)simultaneous onset. Input must be time-sorted. */
export function groupChords<T extends { time: number }>(notes: T[], eps = CHORD_EPS): number[][] {
  const groups: number[][] = [];
  let start = -Infinity;
  for (let i = 0; i < notes.length; i++) {
    if (notes[i].time - start > eps) {
      groups.push([i]);
      start = notes[i].time;
    } else {
      groups[groups.length - 1].push(i);
    }
  }
  return groups;
}

/** Transposition (-5..+6) that puts the most notes on white keys; ties prefer the smallest move. */
export function suggestTransposition(notes: { midi: number }[]): number {
  let best = 0;
  let bestBlack = Infinity;
  const order = [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, 6];
  for (const t of order) {
    let black = 0;
    for (const n of notes) if (isBlack(n.midi + t)) black++;
    if (black < bestBlack) {
      bestBlack = black;
      best = t;
    }
  }
  return best;
}

/**
 * Converts song notes into laptop-keyboard instructions.
 *
 * - `fold`: one fixed octave; anything outside it is moved by octaves and flagged.
 * - `auto` / `manual`: the octave follows the music; a shift cue is emitted
 *   whenever it has to change (applied by the tutor in `auto`, by the learner
 *   pressing the octave keys in `manual`).
 *
 * Nothing is ever dropped silently: every compromise is flagged on the note
 * and counted in the report.
 */
export function buildMappingPlan(source: SongNote[], mapping: KeyMapping, options: MappingOptions): MappingPlan {
  const offsets = mappedOffsets(mapping);
  const notes: MappedNote[] = source
    .map((n, index) => ({
      ...n,
      index,
      playMidi: n.midi + options.transpose,
      shift: 0,
      code: null as string | null,
      folded: false,
      assisted: false,
      duplicate: false,
    }))
    .sort((a, b) => a.time - b.time || a.midi - b.midi);

  const report: MappingReport = {
    total: notes.length,
    folded: 0,
    unmapped: 0,
    duplicates: 0,
    assisted: 0,
    heavyChords: 0,
    octaveChanges: 0,
    transpose: options.transpose,
    baseShift: 0,
    maxKeysAtOnce: 0,
    lowest: notes.reduce((m, n) => Math.min(m, n.midi), 127),
    highest: notes.reduce((m, n) => Math.max(m, n.midi), 0),
  };
  if (notes.length === 0 || offsets.length === 0) {
    report.unmapped = notes.length;
    return { notes, shifts: [], report };
  }

  const shiftsRange = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
  const windows = new Map(shiftsRange.map((s) => [s, windowFor(offsets, s)]));
  const fits = (midi: number, s: number) => windows.get(s)!.has(midi);
  const groups = groupChords(notes);

  // Best single octave for the whole piece (used by `fold`, and as the start for the others).
  let baseShift = 0;
  let bestCount = -1;
  for (const s of [0, -1, 1, -2, 2, -3, 3, -4, 4]) {
    let c = 0;
    for (const n of notes) if (fits(n.playMidi, s)) c++;
    if (c > bestCount) {
      bestCount = c;
      baseShift = s;
    }
  }
  report.baseShift = baseShift;

  const shifts: ShiftCue[] = [{ time: 0, shift: baseShift }];
  let current = baseShift;
  const LOOKAHEAD = 12;

  groups.forEach((group, gi) => {
    if (options.mode !== 'fold') {
      const allFit = group.every((i) => fits(notes[i].playMidi, current));
      if (!allFit) {
        let best = current;
        let bestScore = -Infinity;
        for (const s of shiftsRange) {
          let score = 0;
          for (const i of group) if (fits(notes[i].playMidi, s)) score += 100;
          for (let k = gi + 1; k < Math.min(groups.length, gi + 1 + LOOKAHEAD); k++) {
            for (const i of groups[k]) if (fits(notes[i].playMidi, s)) score += 1;
          }
          score -= Math.abs(s - current) * 0.5;
          if (score > bestScore) {
            bestScore = score;
            best = s;
          }
        }
        if (best !== current) {
          current = best;
          shifts.push({ time: notes[group[0]].time, shift: current });
          report.octaveChanges++;
        }
      }
    }

    const win = windows.get(current)!;
    const lo = BASE_C + current * 12 + offsets[0];
    const hi = BASE_C + current * 12 + offsets[offsets.length - 1];
    const used = new Set<number>();
    for (const i of group) {
      const n = notes[i];
      n.shift = current;
      const target = foldInto(n.playMidi, win, lo, hi);
      if (target === null) {
        report.unmapped++;
        n.assisted = true;
        continue;
      }
      if (target !== n.playMidi) {
        n.folded = true;
        report.folded++;
        n.playMidi = target;
      }
      if (used.has(target)) {
        n.duplicate = true;
        n.assisted = true;
        report.duplicates++;
        continue;
      }
      used.add(target);
      n.code = codeForMidi(mapping, target, current);
    }

    // Optional thinning of big chords: keep the melody (top) and the bass, then fill downwards.
    let playable = group.filter((i) => !notes[i].assisted).sort((a, b) => notes[b].playMidi - notes[a].playMidi);
    if (options.maxSimultaneous && playable.length > options.maxSimultaneous) {
      const keep = new Set<number>([playable[0]]);
      if (options.maxSimultaneous >= 2) keep.add(playable[playable.length - 1]);
      for (const i of playable) {
        if (keep.size >= options.maxSimultaneous) break;
        keep.add(i);
      }
      for (const i of playable) {
        if (!keep.has(i)) {
          notes[i].assisted = true;
          report.assisted++;
        }
      }
      playable = playable.filter((i) => keep.has(i));
    }
    if (playable.length > SAFE_ROLLOVER) report.heavyChords++;
    report.maxKeysAtOnce = Math.max(report.maxKeysAtOnce, playable.length);
  });

  return { notes, shifts, report };
}

/** Human-readable warnings for the UI, derived from a mapping report. */
export function describeReport(r: MappingReport, mode: MappingMode): string[] {
  const out: string[] = [];
  if (r.total === 0) return out;
  const pct = (n: number) => `${Math.round((n / r.total) * 100)}%`;
  if (r.folded > 0)
    out.push(
      `${r.folded} of ${r.total} notes (${pct(r.folded)}) are outside the laptop range and are played an octave or more away from the original.`,
    );
  if (r.octaveChanges > 0)
    out.push(
      mode === 'manual'
        ? `You need to press the octave keys ${r.octaveChanges} time(s); cues appear in the note lane.`
        : `The octave changes automatically ${r.octaveChanges} time(s) to follow the music.`,
    );
  if (r.duplicates > 0)
    out.push(`${r.duplicates} note(s) land on a key already used in the same chord; the app plays those for you.`);
  if (r.assisted > 0)
    out.push(`${r.assisted} chord note(s) were thinned by the simplify setting and are played by the app.`);
  if (r.unmapped > 0) out.push(`${r.unmapped} note(s) have no key in the current layout; the app plays them for you.`);
  if (r.heavyChords > 0)
    out.push(
      `${r.heavyChords} chord(s) need ${SAFE_ROLLOVER + 1}+ keys at once (max ${r.maxKeysAtOnce}). Many laptop keyboards cannot register that; test yours in Settings or enable chord simplification.`,
    );
  return out;
}
