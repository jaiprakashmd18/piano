import { nameToMidi } from '@/lib/music/notes';
import type { Hand, SongNote } from './types';

/**
 * Compact text notation used for the built-in arrangements.
 *
 *   "E4 E4 F4 G4 | G4:2 -:2 | C3+G3:4 | @.5 E5 D#5"
 *
 *   NOTE[:beats]   a note (default length 1 beat, or the current @ default)
 *   A+B+C[:beats]  a chord
 *   -[:beats]      a rest
 *   @beats         change the default length for the tokens that follow
 *   |              bar line (ignored for timing; used by the bar-length checker)
 */
export interface ParsedHand {
  notes: { midi: number; beat: number; beats: number }[];
  /** Length in beats of every bar delimited by `|`. */
  bars: number[];
  totalBeats: number;
}

export function parseHand(text: string): ParsedHand {
  const notes: ParsedHand['notes'] = [];
  const bars: number[] = [];
  let beat = 0;
  let barStart = 0;
  let def = 1;
  for (const raw of text.split(/\s+/)) {
    if (!raw) continue;
    if (raw === '|') {
      bars.push(+(beat - barStart).toFixed(6));
      barStart = beat;
      continue;
    }
    if (raw.startsWith('@')) {
      def = Number(raw.slice(1));
      if (!Number.isFinite(def) || def <= 0) throw new Error(`Bad default length "${raw}"`);
      continue;
    }
    const [head, len] = raw.split(':');
    const beats = len === undefined ? def : Number(len);
    if (!Number.isFinite(beats) || beats <= 0) throw new Error(`Bad length in "${raw}"`);
    if (head !== '-') {
      for (const name of head.split('+')) {
        const midi = nameToMidi(name);
        if (midi === null) throw new Error(`Bad note "${name}" in "${raw}"`);
        notes.push({ midi, beat, beats });
      }
    }
    beat += beats;
  }
  if (beat > barStart) bars.push(+(beat - barStart).toFixed(6));
  return { notes, bars, totalBeats: beat };
}

export function handToNotes(text: string, hand: Hand, bpm: number, velocity = 0.8): SongNote[] {
  const spb = 60 / bpm;
  return parseHand(text).notes.map((n) => ({
    midi: n.midi,
    time: n.beat * spb,
    // Slight articulation gap so repeated notes re-trigger cleanly.
    duration: Math.max(0.08, n.beats * spb * 0.94),
    velocity,
    hand,
  }));
}
