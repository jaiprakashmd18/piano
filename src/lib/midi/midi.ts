import { Midi } from '@tonejs/midi';
import type { Hand, Song, SongNote } from '@/lib/learn/types';

export type TrackRole = 'right' | 'left' | 'split' | 'backing' | 'skip';

export interface ImportedTrack {
  index: number;
  name: string;
  instrument: string;
  channel: number;
  percussion: boolean;
  noteCount: number;
  low: number;
  high: number;
  avgPitch: number;
  /** When the track first and last plays, in seconds. */
  firstTime: number;
  lastTime: number;
  /** Share of notes that overlap the previous one (0 = a single-line melody, 1 = all chords). */
  polyphony: number;
  notes: { midi: number; time: number; duration: number; velocity: number }[];
}

export interface ImportedMidi {
  name: string;
  bpm: number;
  tempoChanges: number;
  timeSignature: [number, number];
  duration: number;
  tracks: ImportedTrack[];
}

/** Notes below this go to the left hand when a single track is split. */
export const SPLIT_POINT = 60;

/**
 * Parses a Standard MIDI File. Note times come out in seconds with the full
 * tempo map already applied, so tempo changes inside the file are respected.
 */
export function parseMidi(data: ArrayBuffer | Uint8Array, fileName = ''): ImportedMidi {
  let midi: Midi;
  try {
    midi = new Midi(data);
  } catch {
    throw new Error('This file could not be read as a Standard MIDI File (.mid).');
  }
  const tracks: ImportedTrack[] = [];
  midi.tracks.forEach((t, index) => {
    if (t.notes.length === 0) return;
    let low = 127;
    let high = 0;
    let sum = 0;
    const notes = t.notes.map((n) => {
      low = Math.min(low, n.midi);
      high = Math.max(high, n.midi);
      sum += n.midi;
      return { midi: n.midi, time: n.time, duration: Math.max(0.03, n.duration), velocity: n.velocity || 0.7 };
    });
    tracks.push({
      index,
      name: t.name || t.instrument.name || `Track ${index + 1}`,
      instrument: t.instrument.name,
      channel: t.channel,
      percussion: t.instrument.percussion || t.channel === 9,
      noteCount: notes.length,
      low,
      high,
      avgPitch: sum / notes.length,
      firstTime: notes[0].time,
      lastTime: notes[notes.length - 1].time,
      polyphony: notes.length < 2 ? 0 : notes.filter((n, i) => i > 0 && n.time < notes[i - 1].time + notes[i - 1].duration - 0.03).length / (notes.length - 1),
      notes,
    });
  });
  if (tracks.length === 0) throw new Error('This MIDI file contains no notes.');
  const ts = midi.header.timeSignatures[0]?.timeSignature;
  return {
    // Embedded names are usually the sequencer author or first track, so the file name is the better title.
    name: fileName.replace(/\.(mid|midi)$/i, '').replace(/^[0-9a-f]{8}-(?=\S)/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim() || midi.name || 'Imported song',
    bpm: Math.round(midi.header.tempos[0]?.bpm ?? 120),
    tempoChanges: Math.max(0, midi.header.tempos.length - 1),
    timeSignature: ts && ts.length >= 2 ? [ts[0], ts[1]] : [4, 4],
    duration: midi.duration,
    tracks,
  };
}

/**
 * How likely a track is to be the tune: a melody is a single line (little
 * overlap), is present for most of the song, and sits in a singable register.
 * Pitch alone is a poor guide, since high decorative parts are common.
 */
export function melodyScore(t: ImportedTrack, duration: number): number {
  if (t.percussion || t.noteCount < 8) return 0;
  const coverage = duration > 0 ? Math.min(1, (t.lastTime - t.firstTime) / duration) : 1;
  const register = t.avgPitch < 52 ? 0.25 : t.avgPitch > 96 ? 0.6 : 1;
  return coverage * (1 - 0.8 * t.polyphony) * register;
}

/** Sensible starting roles. Two-track files are treated as right/left hand; bigger arrangements get melody + bass. */
export function defaultRoles(m: ImportedMidi): Record<number, TrackRole> {
  const roles: Record<number, TrackRole> = {};
  const melodic = m.tracks.filter((t) => !t.percussion);
  for (const t of m.tracks) roles[t.index] = 'skip';
  if (melodic.length === 1) {
    roles[melodic[0].index] = melodic[0].high - melodic[0].low > 24 ? 'split' : 'right';
  } else if (melodic.length === 2) {
    const [hi, lo] = [...melodic].sort((a, b) => b.avgPitch - a.avgPitch);
    roles[hi.index] = 'right';
    roles[lo.index] = 'left';
  } else if (melodic.length > 2) {
    const ranked = [...melodic].sort((a, b) => melodyScore(b, m.duration) - melodyScore(a, m.duration) || b.avgPitch - a.avgPitch);
    const melody = ranked[0];
    roles[melody.index] = 'right';
    const bass = melodic
      .filter((t) => t !== melody && t.avgPitch < 55 && t.lastTime - t.firstTime > m.duration * 0.4)
      .sort((a, b) => a.avgPitch - b.avgPitch)[0];
    if (bass) roles[bass.index] = 'left';
  }
  return roles;
}

export function songFromMidi(m: ImportedMidi, roles: Record<number, TrackRole>, id: string, meta: Partial<Song> = {}): Song {
  const notes: SongNote[] = [];
  for (const t of m.tracks) {
    const role = roles[t.index] ?? 'skip';
    if (role === 'skip') continue;
    for (const n of t.notes) {
      if (role === 'backing') notes.push({ ...n, hand: n.midi < SPLIT_POINT ? 'left' : 'right', backing: true });
      else notes.push({ ...n, hand: (role === 'split' ? (n.midi < SPLIT_POINT ? 'left' : 'right') : role) as Hand });
    }
  }
  notes.sort((a, b) => a.time - b.time || a.midi - b.midi);
  const hasLeft = notes.some((n) => n.hand === 'left' && !n.backing);
  return {
    id,
    title: m.name,
    artist: 'Imported MIDI',
    difficulty: 'Intermediate',
    key: 'Unknown',
    bpm: m.bpm,
    duration: notes.reduce((d, n) => Math.max(d, n.time + n.duration), 0),
    arrangement: hasLeft ? 'Two hands (from MIDI)' : 'Melody only (from MIDI)',
    license: 'Supplied by you. Only import files you are authorised to use.',
    source: 'import',
    category: 'My imports',
    timeSignature: m.timeSignature,
    notes,
    ...meta,
  };
}

export interface ExportNote {
  midi: number;
  time: number;
  duration: number;
  velocity: number;
}

/** Writes a single-track Standard MIDI File. */
export function notesToMidiFile(notes: ExportNote[], bpm: number, name: string): Uint8Array {
  const midi = new Midi();
  midi.name = name;
  midi.header.setTempo(bpm);
  const track = midi.addTrack();
  track.name = name;
  for (const n of notes) {
    track.addNote({ midi: n.midi, time: Math.max(0, n.time), duration: Math.max(0.02, n.duration), velocity: Math.max(0.05, Math.min(1, n.velocity)) });
  }
  return midi.toArray();
}
