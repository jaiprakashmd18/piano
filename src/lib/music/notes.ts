/** Pitch helpers. MIDI note 60 = C4 (scientific pitch notation). */

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

export const PIANO_MIN = 21; // A0
export const PIANO_MAX = 108; // C8

const BLACK = new Set([1, 3, 6, 8, 10]);

export function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

export function isBlack(midi: number): boolean {
  return BLACK.has(pitchClass(midi));
}

export function midiToName(midi: number): string {
  return `${NOTE_NAMES[pitchClass(midi)]}${Math.floor(midi / 12) - 1}`;
}

const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Parses "C4", "F#3", "Bb5", "Ds1". Returns null when the text is not a note. */
export function nameToMidi(name: string): number | null {
  const m = /^([A-Ga-g])([#sb]?)(-?\d)$/.exec(name.trim());
  if (!m) return null;
  let pc = LETTER[m[1].toUpperCase()];
  if (m[2] === '#' || m[2] === 's') pc += 1;
  if (m[2] === 'b') pc -= 1;
  return (Number(m[3]) + 1) * 12 + pc;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function clampMidi(midi: number): number {
  return Math.max(0, Math.min(127, midi));
}

export interface KeyGeometry {
  midi: number;
  black: boolean;
  /** Left edge and width, in white-key units. */
  x: number;
  w: number;
}

/**
 * Layout of piano keys between two MIDI notes (inclusive), measured in
 * white-key widths. Shared by the keyboard and the falling-note lane so both
 * always line up exactly.
 */
export function keyboardGeometry(low: number, high: number): { keys: KeyGeometry[]; whiteCount: number } {
  let lo = low;
  let hi = high;
  if (isBlack(lo)) lo -= 1;
  if (isBlack(hi)) hi += 1;
  const keys: KeyGeometry[] = [];
  let white = 0;
  for (let m = lo; m <= hi; m++) {
    if (isBlack(m)) {
      keys.push({ midi: m, black: true, x: white - 0.3, w: 0.6 });
    } else {
      keys.push({ midi: m, black: false, x: white, w: 1 });
      white += 1;
    }
  }
  return { keys, whiteCount: white };
}
