export type Hand = 'left' | 'right';

export interface SongNote {
  midi: number;
  /** Seconds from song start at 100% speed. */
  time: number;
  duration: number;
  velocity: number;
  hand: Hand;
  /** Accompaniment from an imported track: always played by the app, never asked of the learner. */
  backing?: boolean;
}

export type Difficulty = 'Beginner' | 'Easy' | 'Intermediate' | 'Advanced';

export interface SongMeta {
  id: string;
  title: string;
  artist: string;
  difficulty: Difficulty;
  key: string;
  bpm: number;
  /** Seconds. */
  duration: number;
  arrangement: string;
  /** Where the arrangement comes from / why we may distribute it. */
  license: string;
  source: 'builtin' | 'import' | 'recording';
  category: string;
  timeSignature: [number, number];
}

export interface Song extends SongMeta {
  notes: SongNote[];
}
