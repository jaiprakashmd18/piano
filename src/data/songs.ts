import { handToNotes, parseHand } from '@/lib/learn/notation';
import type { Difficulty, Song } from '@/lib/learn/types';

/**
 * Built-in arrangements. Every piece here is either a public-domain / traditional
 * melody arranged for this project, or an original composition written for it.
 * No copyrighted songs are bundled; users import their own authorised MIDI files.
 */
export interface SongSource {
  id: string;
  title: string;
  artist: string;
  difficulty: Difficulty;
  key: string;
  bpm: number;
  timeSignature: [number, number];
  /** Bar length in quarter-note beats (used by the notation checker). */
  barBeats: number;
  /** Beats of pickup-padding in the first bar are already written as rests. */
  arrangement: string;
  license: string;
  category: string;
  right: string;
  left: string;
}

const PD = 'Public domain melody; arrangement original to Aurora Keys';
const ORIGINAL = 'Original composition for Aurora Keys (free to use)';

/** Bach-style broken chord bar: first two notes left hand, the rest right hand. */
function prelude(bars: string[][]): { right: string; left: string } {
  const right: string[] = [];
  const left: string[] = [];
  for (const [a, b, c, d, e] of bars) {
    left.push(`@.25 ${a} ${b} -:1.5 ${a} ${b} -:1.5 |`);
    right.push(`@.25 -:.5 ${c} ${d} ${e} ${c} ${d} ${e} -:.5 ${c} ${d} ${e} ${c} ${d} ${e} |`);
  }
  return { right: right.join(' '), left: left.join(' ') };
}

const bach = prelude([
  ['C4', 'E4', 'G4', 'C5', 'E5'],
  ['C4', 'D4', 'A4', 'D5', 'F5'],
  ['B3', 'D4', 'G4', 'D5', 'F5'],
  ['C4', 'E4', 'G4', 'C5', 'E5'],
  ['C4', 'E4', 'A4', 'E5', 'A5'],
  ['C4', 'D4', 'F#4', 'A4', 'D5'],
  ['B3', 'D4', 'G4', 'D5', 'G5'],
  ['B3', 'C4', 'E4', 'G4', 'C5'],
  ['A3', 'C4', 'E4', 'G4', 'C5'],
  ['D3', 'A3', 'D4', 'F#4', 'C5'],
  ['G3', 'B3', 'D4', 'G4', 'B4'],
]);

const ELISE_A_R = '@.5 E5 D#5 E5 B4 D5 C5 | A4:1 -:.5 C4 E4 A4 | B4:1 -:.5 E4 G#4 B4 | C5:1 -:.5 E4 E5 D#5 | E5 D#5 E5 B4 D5 C5 | A4:1 -:.5 C4 E4 A4 | B4:1 -:.5 E4 C5 B4 |';
const ELISE_A_L = '@.5 -:3 | A2 E3 A3 -:1.5 | E2 E3 G#3 -:1.5 | A2 E3 A3 -:1.5 | -:3 | A2 E3 A3 -:1.5 | E2 E3 G#3 -:1.5 |';

export const SONG_SOURCES: SongSource[] = [
  {
    id: 'warmup-five-finger',
    title: 'Five-Finger Warm-up',
    artist: 'Aurora Keys exercise',
    difficulty: 'Beginner',
    key: 'C major',
    bpm: 80,
    timeSignature: [4, 4],
    barBeats: 4,
    arrangement: 'Right hand only',
    license: ORIGINAL,
    category: 'Exercises',
    right: 'C4 D4 E4 F4 | G4:2 G4:2 | G4 F4 E4 D4 | C4:2 C4:2 | C4 E4 D4 F4 | E4 G4 F4 D4 | C4 E4 G4 E4 | C4:4',
    left: '',
  },
  {
    id: 'c-major-scale',
    title: 'C Major Scale',
    artist: 'Aurora Keys exercise',
    difficulty: 'Beginner',
    key: 'C major',
    bpm: 80,
    timeSignature: [4, 4],
    barBeats: 4,
    arrangement: 'Right hand only',
    license: ORIGINAL,
    category: 'Exercises',
    right: 'C4 D4 E4 F4 | G4 A4 B4 C5 | C5 B4 A4 G4 | F4 E4 D4 C4 | C4+E4+G4:4',
    left: '',
  },
  {
    id: 'mary-lamb',
    title: 'Mary Had a Little Lamb',
    artist: 'Traditional',
    difficulty: 'Beginner',
    key: 'C major',
    bpm: 100,
    timeSignature: [4, 4],
    barBeats: 4,
    arrangement: 'Melody + simple left hand',
    license: PD,
    category: 'Traditional',
    right: 'E4 D4 C4 D4 | E4 E4 E4:2 | D4 D4 D4:2 | E4 G4 G4:2 | E4 D4 C4 D4 | E4 E4 E4 E4 | D4 D4 E4 D4 | C4:4',
    left: 'C3+G3:4 | C3+G3:4 | G2+D3:4 | C3+G3:4 | C3+G3:4 | C3+G3:4 | G2+D3:4 | C3+G3:4',
  },
  {
    id: 'twinkle',
    title: 'Twinkle, Twinkle, Little Star',
    artist: 'Traditional (French melody, 1761)',
    difficulty: 'Beginner',
    key: 'C major',
    bpm: 100,
    timeSignature: [4, 4],
    barBeats: 4,
    arrangement: 'Melody + simple left hand',
    license: PD,
    category: 'Traditional',
    right:
      'C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2 | G4 G4 F4 F4 | E4 E4 D4:2 | G4 G4 F4 F4 | E4 E4 D4:2 | C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2',
    left:
      'C3:4 | F3:2 C3:2 | F3:2 C3:2 | G2:2 C3:2 | C3:2 F3:2 | C3:2 G2:2 | C3:2 F3:2 | C3:2 G2:2 | C3:4 | F3:2 C3:2 | F3:2 C3:2 | G2:2 C3:2',
  },
  {
    id: 'ode-to-joy',
    title: 'Ode to Joy',
    artist: 'Ludwig van Beethoven',
    difficulty: 'Easy',
    key: 'C major',
    bpm: 108,
    timeSignature: [4, 4],
    barBeats: 4,
    arrangement: 'Melody + simple left hand',
    license: PD,
    category: 'Classical',
    right:
      'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:1.5 D4:.5 D4:2 | E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:.5 C4:2 | D4 D4 E4 C4 | D4 E4:.5 F4:.5 E4 C4 | D4 E4:.5 F4:.5 E4 D4 | C4 D4 G3:2 | E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:.5 C4:2',
    left:
      'C3+G3:4 | G2+D3:4 | C3+G3:4 | G2+D3:4 | C3+G3:4 | G2+D3:4 | C3+G3:4 | G2+D3:2 C3+G3:2 | G2+D3:2 C3+G3:2 | G2+D3:2 C3+G3:2 | G2+D3:2 C3+G3:2 | C3 D3 G2:2 | C3+G3:4 | G2+D3:4 | C3+G3:4 | G2+D3:2 C3+G3:2',
  },
  {
    id: 'jingle-bells',
    title: 'Jingle Bells (chorus)',
    artist: 'James Lord Pierpont',
    difficulty: 'Easy',
    key: 'C major',
    bpm: 120,
    timeSignature: [4, 4],
    barBeats: 4,
    arrangement: 'Melody + simple left hand',
    license: PD,
    category: 'Traditional',
    right:
      'E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4:1.5 D4:.5 | E4:4 | F4 F4 F4:1.5 F4:.5 | F4 E4 E4 E4:.5 E4:.5 | E4 D4 D4 E4 | D4:2 G4:2 | E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4:1.5 D4:.5 | E4:4 | F4 F4 F4:1.5 F4:.5 | F4 E4 E4 E4:.5 E4:.5 | G4 G4 F4 D4 | C4:4',
    left:
      'C3+G3:4 | C3+G3:4 | C3+G3:4 | C3+G3:4 | F2+C3:4 | C3+G3:4 | D3+A3:4 | G2+D3:4 | C3+G3:4 | C3+G3:4 | C3+G3:4 | C3+G3:4 | F2+C3:4 | C3+G3:4 | G2+D3:4 | C3+G3:4',
  },
  {
    id: 'happy-birthday',
    title: 'Happy Birthday to You',
    artist: 'Traditional (Hill sisters melody)',
    difficulty: 'Easy',
    key: 'F major',
    bpm: 96,
    timeSignature: [3, 4],
    barBeats: 3,
    arrangement: 'Melody + simple left hand',
    license: PD,
    category: 'Traditional',
    right:
      '-:2 C4:.75 C4:.25 | D4 C4 F4 | E4:2 C4:.75 C4:.25 | D4 C4 G4 | F4:2 C4:.75 C4:.25 | C5 A4 F4 | E4 D4 A#4:.75 A#4:.25 | A4 F4 G4 | F4:3',
    left: '-:3 | F3:3 | C3:3 | C3:3 | F3:3 | F3:3 | A#2:3 | F3:2 C3:1 | F3:3',
  },
  {
    id: 'amazing-grace',
    title: 'Amazing Grace',
    artist: 'Traditional hymn',
    difficulty: 'Easy',
    key: 'G major',
    bpm: 84,
    timeSignature: [3, 4],
    barBeats: 3,
    arrangement: 'Melody + open-fifth left hand',
    license: PD,
    category: 'Traditional',
    right:
      '-:2 D4 | G4:2 B4:.5 G4:.5 | B4:2 A4 | G4:2 E4 | D4:2 D4 | G4:2 B4:.5 G4:.5 | B4:2 A4 | D5:3 | D5:2 B4 | D5:2 B4:.5 G4:.5 | B4:2 A4 | G4:2 E4 | D4:2 D4 | G4:2 B4:.5 G4:.5 | B4:2 A4 | G4:3',
    left:
      '-:3 | G2+D3:3 | G2+D3:3 | C3+G3:3 | G2+D3:3 | G2+D3:3 | G2+D3:2 D3+A3:1 | D3+A3:3 | D3+A3:3 | G2+D3:3 | G2+D3:3 | C3+G3:3 | G2+D3:3 | G2+D3:3 | G2+D3:2 D3+A3:1 | G2+D3:3',
  },
  {
    id: 'greensleeves',
    title: 'Greensleeves',
    artist: 'Traditional English',
    difficulty: 'Intermediate',
    key: 'A minor',
    bpm: 108,
    timeSignature: [6, 8],
    barBeats: 3,
    arrangement: 'Melody + open-fifth left hand',
    license: PD,
    category: 'Traditional',
    right:
      '-:2.5 A4:.5 | C5 D5:.5 E5:.75 F5:.25 E5:.5 | D5 B4:.5 G4:.75 A4:.25 B4:.5 | C5 A4:.5 A4:.75 G#4:.25 A4:.5 | B4 G#4:.5 E4 A4:.5 | C5 D5:.5 E5:.75 F5:.25 E5:.5 | D5 B4:.5 G4:.75 A4:.25 B4:.5 | C5:.75 B4:.25 A4:.5 G#4:.75 F#4:.25 G#4:.5 | A4:1.5 A4:1.5 | G5:1.5 G5:.75 F#5:.25 E5:.5 | D5 B4:.5 G4:.75 A4:.25 B4:.5 | C5 A4:.5 A4:.75 G#4:.25 A4:.5 | B4 G#4:.5 E4:1.5 | G5:1.5 G5:.75 F#5:.25 E5:.5 | D5 B4:.5 G4:.75 A4:.25 B4:.5 | C5:.75 B4:.25 A4:.5 G#4:.75 F#4:.25 G#4:.5 | A4:3',
    left:
      '-:3 | A2+E3:3 | G2+D3:3 | A2+E3:3 | E2+E3:3 | A2+E3:3 | G2+D3:3 | A2+E3:1.5 E2+E3:1.5 | A2+E3:3 | C3+G3:3 | G2+D3:3 | A2+E3:3 | E2+E3:3 | C3+G3:3 | G2+D3:3 | A2+E3:1.5 E2+E3:1.5 | A2+E3:3',
  },
  {
    id: 'minuet-in-g',
    title: 'Minuet in G',
    artist: 'Christian Petzold (Anna Magdalena Notebook)',
    difficulty: 'Intermediate',
    key: 'G major',
    bpm: 112,
    timeSignature: [3, 4],
    barBeats: 3,
    arrangement: 'Two hands (first section)',
    license: PD,
    category: 'Classical',
    right:
      'D5 G4:.5 A4:.5 B4:.5 C5:.5 | D5 G4 G4 | E5 C5:.5 D5:.5 E5:.5 F#5:.5 | G5 G4 G4 | C5 D5:.5 C5:.5 B4:.5 A4:.5 | B4 C5:.5 B4:.5 A4:.5 G4:.5 | F#4 G4:.5 A4:.5 B4:.5 G4:.5 | A4:3 | D5 G4:.5 A4:.5 B4:.5 C5:.5 | D5 G4 G4 | E5 C5:.5 D5:.5 E5:.5 F#5:.5 | G5 G4 G4 | C5 D5:.5 C5:.5 B4:.5 A4:.5 | B4 C5:.5 B4:.5 A4:.5 G4:.5 | A4 B4:.5 A4:.5 G4:.5 F#4:.5 | G4:3',
    left:
      'G3:2 A3 | B3:3 | C4:3 | B3:3 | A3:3 | G3:3 | D4 B3 G3 | D4 D3:.5 C4:.5 B3:.5 A3:.5 | B3:2 A3 | G3 B3 G3 | C4:3 | B3 C4:.5 B3:.5 A3:.5 G3:.5 | A3:2 F#3 | G3:2 B3 | C4 D4 D3 | G3:2 G2',
  },
  {
    id: 'fur-elise',
    title: 'Für Elise (opening)',
    artist: 'Ludwig van Beethoven',
    difficulty: 'Intermediate',
    key: 'A minor',
    bpm: 126,
    timeSignature: [3, 8],
    barBeats: 3,
    arrangement: 'Two hands, simplified left hand',
    license: PD,
    category: 'Classical',
    right: `@.5 -:2 E5 D#5 | ${ELISE_A_R} A4:1 -:1 E5 D#5 | ${ELISE_A_R} A4:1 -:.5 B4 C5 D5 | E5:1.5 G4 F5 E5 | D5:1.5 F4 E5 D5 | C5:1.5 E4 D5 C5 | B4:1 E4 E5 E4 E5 | E5 D#5 E5 D#5 E5 D#5 | ${ELISE_A_R} A4:3`,
    left: `@.5 -:3 | ${ELISE_A_L} A2 E3 A3 -:1.5 | ${ELISE_A_L} A2 E3 A3 -:1.5 | C3 G3 C4 -:1.5 | G2 G3 B3 -:1.5 | A2 E3 A3 -:1.5 | E2 E3 E4 -:1.5 | -:3 | ${ELISE_A_L} A2+E3+A3:3`,
  },
  {
    id: 'canon-in-d',
    title: 'Canon in D (theme)',
    artist: 'Johann Pachelbel',
    difficulty: 'Intermediate',
    key: 'D major',
    bpm: 84,
    timeSignature: [4, 4],
    barBeats: 4,
    arrangement: 'Simplified theme over the ground bass',
    license: PD,
    category: 'Classical',
    right:
      'F#5:2 E5:2 | D5:2 C#5:2 | B4:2 A4:2 | B4:2 C#5:2 | D5:2 C#5:2 | B4:2 A4:2 | G4:2 F#4:2 | G4:2 E4:2 | @.5 D4 F#4 A4 G4 F#4 D4 F#4 E4 | D4 B3 D4 A4 G4 B4 A4 G4 | F#4 D4 E4 C#5 D5 F#5 A5 A4 | B4 G4 A4 F#4 D4 D5 D5:.75 C#5:.25 | D5:4',
    left:
      'D3:2 A2:2 | B2:2 F#2:2 | G2:2 D2:2 | G2:2 A2:2 | D3:2 A2:2 | B2:2 F#2:2 | G2:2 D2:2 | G2:2 A2:2 | D3:2 A2:2 | B2:2 F#2:2 | G2:2 D2:2 | G2:2 A2:2 | D2+A2+D3:4',
  },
  {
    id: 'prelude-in-c',
    title: 'Prelude in C (opening)',
    artist: 'Johann Sebastian Bach, BWV 846',
    difficulty: 'Advanced',
    key: 'C major',
    bpm: 66,
    timeSignature: [4, 4],
    barBeats: 4,
    arrangement: 'Original hand distribution, first 11 bars',
    license: PD,
    category: 'Classical',
    right: `${bach.right} C4+E4+G4+C5:4`,
    left: `${bach.left} C3:4`,
  },
  {
    id: 'first-light',
    title: 'First Light',
    artist: 'Aurora Keys original',
    difficulty: 'Intermediate',
    key: 'C major',
    bpm: 72,
    timeSignature: [4, 4],
    barBeats: 4,
    arrangement: 'Romantic ballad: melody + arpeggio left hand',
    license: ORIGINAL,
    category: 'Romantic',
    right:
      'E5:1.5 D5:.5 C5:2 | D5:1.5 C5:.5 B4:2 | C5:1.5 B4:.5 A4 E5 | F5:1.5 E5:.5 C5:2 | E5:1.5 D5:.5 C5 G5 | G5:1.5 F5:.5 D5:2 | E5 D5 C5 A4 | C5:4',
    left:
      '@.5 C3 G3 C4 G3 E4 G3 C4 G3 | G2 D3 G3 D3 B3 D3 G3 D3 | A2 E3 A3 E3 C4 E3 A3 E3 | F2 C3 F3 C3 A3 C3 F3 C3 | C3 G3 C4 G3 E4 G3 C4 G3 | G2 D3 G3 D3 B3 D3 G3 D3 | F2 C3 F3 C3 A3 C3 F3 C3 | C3+G3+C4:4',
  },
  {
    id: 'monsoon-evening',
    title: 'Monsoon Evening',
    artist: 'Aurora Keys original',
    difficulty: 'Easy',
    key: 'C (Mohanam-style pentatonic)',
    bpm: 90,
    timeSignature: [4, 4],
    barBeats: 4,
    arrangement: 'Indian-classical-inspired melody over a drone',
    license: ORIGINAL,
    category: 'Indian-inspired',
    right:
      'E4 G4 A4:2 | C5 A4 G4:2 | E4 G4 A4 G4 | E4 D4 C4:2 | D4 E4 G4:2 | A4 C5 A4 G4 | E4:.5 G4:.5 E4 D4 C4 | C4:4',
    left: 'C3+G3:4 | C3+G3:4 | C3+G3:4 | C3+G3:4 | C3+G3:4 | C3+G3:4 | C3+G3:4 | C3+G3:4',
  },
  {
    id: 'kuthu-street',
    title: 'Kuthu Street',
    artist: 'Aurora Keys original',
    difficulty: 'Intermediate',
    key: 'A minor',
    bpm: 132,
    timeSignature: [4, 4],
    barBeats: 4,
    arrangement: 'Tamil-kuthu-inspired riff + driving bass',
    license: ORIGINAL,
    category: 'Indian-inspired',
    right:
      'A4:.5 A4:.5 C5 B4:.5 A4:.5 G#4 | A4:.5 A4:.5 E5 D5:.5 C5:.5 B4 | C5:.5 C5:.5 E5 D5:.5 C5:.5 B4 | A4:.5 G#4:.5 A4 A4:2 | E5:.5 E5:.5 F5 E5:.5 D5:.5 C5 | D5:.5 D5:.5 E5 D5:.5 C5:.5 B4 | C5:.5 B4:.5 A4 G#4:.5 B4:.5 A4 | A4:4',
    left:
      'A2 E3 A2 E3 | A2 E3 A2 E3 | A2 E3 A2 E3 | A2 E3 A2:2 | A2 E3 A2 E3 | D3 A3 D3 A3 | E3 B3 E2 E3 | A2:4',
  },
];

export function buildSong(src: SongSource): Song {
  const notes = [...handToNotes(src.right, 'right', src.bpm, 0.85), ...(src.left ? handToNotes(src.left, 'left', src.bpm, 0.65) : [])].sort(
    (a, b) => a.time - b.time || a.midi - b.midi,
  );
  const beats = Math.max(parseHand(src.right).totalBeats, src.left ? parseHand(src.left).totalBeats : 0);
  return {
    id: src.id,
    title: src.title,
    artist: src.artist,
    difficulty: src.difficulty,
    key: src.key,
    bpm: src.bpm,
    duration: (beats * 60) / src.bpm,
    arrangement: src.arrangement,
    license: src.license,
    source: 'builtin',
    category: src.category,
    timeSignature: src.timeSignature,
    notes,
  };
}

let cache: Song[] | null = null;
export function builtinSongs(): Song[] {
  if (!cache) cache = SONG_SOURCES.map(buildSong);
  return cache;
}

/**
 * Songs people commonly ask for that we cannot legally bundle. Shown in the
 * library with an honest explanation and a shortcut to MIDI import.
 */
export const NOT_BUNDLED = [
  { title: 'Perfect', artist: 'Ed Sheeran' },
  { title: 'Fairytale', artist: 'Alexander Rybak' },
  { title: 'Tamil film songs', artist: 'Various composers' },
  { title: 'Current pop / film hits', artist: 'Various artists' },
];
