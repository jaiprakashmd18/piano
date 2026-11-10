import { NOTE_NAMES, pitchClass } from './notes';

export type ChordQuality = 'maj' | 'min' | '7' | 'maj7' | 'min7' | 'sus4' | 'sus2' | 'dim' | 'aug';

export interface Chord {
  /** Root pitch class 0-11. */
  root: number;
  quality: ChordQuality;
  /** Optional slash-bass pitch class. */
  bass?: number;
}

export const CHORD_INTERVALS: Record<ChordQuality, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
};

export const QUALITY_LABEL: Record<ChordQuality, string> = {
  maj: '',
  min: 'm',
  '7': '7',
  maj7: 'maj7',
  min7: 'm7',
  sus4: 'sus4',
  sus2: 'sus2',
  dim: 'dim',
  aug: 'aug',
};

export const ALL_QUALITIES = Object.keys(CHORD_INTERVALS) as ChordQuality[];

export function chordName(chord: Chord): string {
  const base = `${NOTE_NAMES[chord.root]}${QUALITY_LABEL[chord.quality]}`;
  return chord.bass !== undefined && chord.bass !== chord.root ? `${base}/${NOTE_NAMES[chord.bass]}` : base;
}

export function chordPitchClasses(chord: Chord): number[] {
  return CHORD_INTERVALS[chord.quality].map((i) => (chord.root + i) % 12);
}

/**
 * Chord tone for an accompaniment "degree": 1 root, 3 third, 5 fifth,
 * 7 seventh (falls back to the sixth above major/minor triads so walking
 * lines stay consonant). Returned as a semitone offset from the root.
 */
export function degreeOffset(quality: ChordQuality, degree: number): number {
  const iv = CHORD_INTERVALS[quality];
  switch (degree) {
    case 1:
      return 0;
    case 2:
      return 2;
    case 3:
      return iv[1];
    case 4:
      return 5;
    case 5:
      return iv[2];
    case 6:
      return 9;
    case 7:
      return iv[3] ?? (quality === 'maj' ? 9 : 10);
    case 8:
      return 12;
    default:
      return 0;
  }
}

// Order matters: when two readings explain the notes equally well the earlier
// quality wins, so plain triads are preferred over exotic names.
const DETECT_ORDER: ChordQuality[] = ['maj', 'min', '7', 'min7', 'maj7', 'sus4', 'sus2', 'dim', 'aug'];

/**
 * Deterministic chord recognition from held notes. Needs at least three
 * distinct pitch classes (or a root+third / root+fifth pair with `allowDyads`).
 * The lowest note breaks ties, so inversions resolve to the same chord.
 */
export function detectChord(midiNotes: number[], allowDyads = false): Chord | null {
  if (midiNotes.length === 0) return null;
  const sorted = [...midiNotes].sort((a, b) => a - b);
  const pcs = new Set(sorted.map(pitchClass));
  const lowest = pitchClass(sorted[0]);
  if (pcs.size < (allowDyads ? 2 : 3)) return null;

  let best: { chord: Chord; score: number } | null = null;
  for (let root = 0; root < 12; root++) {
    if (!pcs.has(root)) continue;
    for (const quality of DETECT_ORDER) {
      const tones = new Set(CHORD_INTERVALS[quality].map((i) => (root + i) % 12));
      let matched = 0;
      let extra = 0;
      for (const pc of pcs) {
        if (tones.has(pc)) matched++;
        else extra++;
      }
      const missing = tones.size - matched;
      // Exact matches only, except a seventh chord may omit its fifth.
      const fifth = (root + CHORD_INTERVALS[quality][2]) % 12;
      const omittedFifthOnly = missing === 1 && tones.size === 4 && !pcs.has(fifth);
      const dyadOk = allowDyads && pcs.size === 2 && missing === 1 && (quality === 'maj' || quality === 'min');
      if (extra > 0 || (missing > 0 && !omittedFifthOnly && !dyadOk)) continue;
      let score = matched * 10 - missing * 3;
      if (root === lowest) score += 5;
      score -= DETECT_ORDER.indexOf(quality) * 0.1;
      if (!best || score > best.score) {
        best = { chord: { root, quality, bass: lowest === root ? undefined : lowest }, score };
      }
    }
  }
  return best?.chord ?? null;
}

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MAJOR_QUALITIES: ChordQuality[] = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
const MINOR_QUALITIES: ChordQuality[] = ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'];

export type KeyMode = 'major' | 'minor';

/**
 * The ten chord-pad slots for a key: seven diatonic triads followed by three
 * common borrowed/colour chords. Slot n is triggered by digit key n (0 = 10).
 */
export function chordPadsForKey(tonic: number, mode: KeyMode): Chord[] {
  const scale = mode === 'major' ? MAJOR_SCALE : MINOR_SCALE;
  const quals = mode === 'major' ? MAJOR_QUALITIES : MINOR_QUALITIES;
  const pads: Chord[] = scale.map((s, i) => ({ root: (tonic + s) % 12, quality: quals[i] }));
  if (mode === 'major') {
    pads.push({ root: (tonic + 7) % 12, quality: '7' }); // V7
    pads.push({ root: (tonic + 10) % 12, quality: 'maj' }); // bVII
    pads.push({ root: (tonic + 5) % 12, quality: 'min' }); // iv
  } else {
    pads.push({ root: (tonic + 7) % 12, quality: '7' }); // V7
    pads.push({ root: (tonic + 7) % 12, quality: 'maj' }); // V
    pads.push({ root: (tonic + 5) % 12, quality: 'maj' }); // IV
  }
  return pads;
}

export const ROMAN_MAJOR = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°', 'V7', '♭VII', 'iv'];
export const ROMAN_MINOR = ['i', 'ii°', '♭III', 'iv', 'v', '♭VI', '♭VII', 'V7', 'V', 'IV'];
