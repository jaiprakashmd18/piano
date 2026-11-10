/** Pure recording data model and edit operations (no audio dependencies). */

export interface RecNote {
  midi: number;
  /** Seconds from the start of the take. */
  time: number;
  duration: number;
  velocity: number;
}

export interface Recording {
  id: string;
  name: string;
  createdAt: number;
  bpm: number;
  instrumentId: string;
  duration: number;
  notes: RecNote[];
}

function withDuration(rec: Recording, notes: RecNote[]): Recording {
  const sorted = [...notes].sort((a, b) => a.time - b.time || a.midi - b.midi);
  return { ...rec, notes: sorted, duration: sorted.reduce((d, n) => Math.max(d, n.time + n.duration), 0) };
}

/** Keeps only [start, end) and moves it to time zero. Notes crossing the edges are clipped. */
export function trimRecording(rec: Recording, start: number, end: number): Recording {
  const notes: RecNote[] = [];
  for (const n of rec.notes) {
    const a = Math.max(n.time, start);
    const b = Math.min(n.time + n.duration, end);
    if (n.time >= end || b - a < 0.02 || n.time + n.duration <= start) continue;
    notes.push({ ...n, time: a - start, duration: b - a });
  }
  return withDuration(rec, notes);
}

/** Removes the silence before the first note. */
export function trimLeadingSilence(rec: Recording): Recording {
  if (rec.notes.length === 0) return rec;
  const first = Math.min(...rec.notes.map((n) => n.time));
  return withDuration(rec, rec.notes.map((n) => ({ ...n, time: n.time - first })));
}

/** Snaps note starts to a grid of `division` notes per beat (2 = eighths, 4 = sixteenths). */
export function quantizeRecording(rec: Recording, division: number): Recording {
  const grid = 60 / rec.bpm / division;
  return withDuration(rec, rec.notes.map((n) => ({ ...n, time: Math.round(n.time / grid) * grid })));
}

/** Bakes a playback-speed change into the take (speed 0.5 = half tempo). */
export function scaleRecording(rec: Recording, speed: number): Recording {
  const k = 1 / speed;
  const scaled = withDuration(rec, rec.notes.map((n) => ({ ...n, time: n.time * k, duration: n.duration * k })));
  return { ...scaled, bpm: Math.round(rec.bpm * speed) };
}

export function transposeRecording(rec: Recording, semitones: number): Recording {
  return withDuration(rec, rec.notes.map((n) => ({ ...n, midi: Math.max(21, Math.min(108, n.midi + semitones)) })));
}

export function deleteNote(rec: Recording, index: number): Recording {
  return withDuration(rec, rec.notes.filter((_, i) => i !== index));
}
