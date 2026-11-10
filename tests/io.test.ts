import { describe, expect, it } from 'vitest';
import { Midi } from '@tonejs/midi';
import { defaultRoles, notesToMidiFile, parseMidi, songFromMidi } from '@/lib/midi/midi';
import { Recording, quantizeRecording, scaleRecording, trimLeadingSilence, trimRecording } from '@/lib/audio/recording';
import { encodeWav } from '@/lib/audio/wav';

const rec: Recording = {
  id: 'r', name: 'Test', createdAt: 0, bpm: 120, instrumentId: 'grand', duration: 3,
  notes: [
    { midi: 60, time: 0.52, duration: 0.5, velocity: 0.8 },
    { midi: 64, time: 1.01, duration: 0.5, velocity: 0.7 },
    { midi: 67, time: 2.0, duration: 1, velocity: 0.9 },
  ],
};

describe('MIDI import / export', () => {
  it('round-trips notes through a Standard MIDI File', () => {
    const bytes = notesToMidiFile(rec.notes, rec.bpm, 'Test');
    const parsed = parseMidi(bytes, 'test.mid');
    expect(parsed.bpm).toBe(120);
    expect(parsed.tracks.length).toBe(1);
    const t = parsed.tracks[0];
    expect(t.notes.map((n) => n.midi)).toEqual([60, 64, 67]);
    expect(t.notes[1].time).toBeCloseTo(1.01, 2);
    expect(t.notes[2].duration).toBeCloseTo(1, 2);
  });
  it('honours tempo maps, multiple tracks and time signatures', () => {
    const m = new Midi();
    m.header.tempos.push({ bpm: 120, ticks: 0 }, { bpm: 60, ticks: m.header.ppq * 2 });
    m.header.timeSignatures.push({ ticks: 0, timeSignature: [3, 4] });
    m.header.update();
    const hi = m.addTrack();
    hi.name = 'Melody';
    hi.addNote({ midi: 76, ticks: 0, durationTicks: m.header.ppq });
    hi.addNote({ midi: 79, ticks: m.header.ppq * 3, durationTicks: m.header.ppq });
    const lo = m.addTrack();
    lo.addNote({ midi: 40, ticks: 0, durationTicks: m.header.ppq * 2 });
    const drums = m.addTrack();
    drums.channel = 9;
    drums.addNote({ midi: 36, ticks: 0, durationTicks: 10 });

    const parsed = parseMidi(m.toArray());
    expect(parsed.timeSignature).toEqual([3, 4]);
    expect(parsed.tempoChanges).toBe(1);
    expect(parsed.tracks.length).toBe(3);
    // two beats at 120 (1 s) + one beat at 60 (1 s) = 2 s
    expect(parsed.tracks[0].notes[1].time).toBeCloseTo(2, 3);
    const roles = defaultRoles(parsed);
    expect(roles[parsed.tracks[0].index]).toBe('right');
    expect(roles[parsed.tracks[1].index]).toBe('left');
    expect(roles[parsed.tracks[2].index]).toBe('skip');
    const song = songFromMidi(parsed, roles, 'x');
    expect(song.notes.length).toBe(3);
    expect(song.notes.filter((n) => n.hand === 'left').length).toBe(1);
    expect(song.source).toBe('import');
  });
  it('rejects files that are not MIDI', () => {
    expect(() => parseMidi(new Uint8Array([1, 2, 3, 4]))).toThrow(/Standard MIDI File/);
  });
});

describe('recording edits', () => {
  it('trims, quantizes and rescales', () => {
    const t = trimRecording(rec, 1, 2.5);
    expect(t.notes.map((n) => n.midi)).toEqual([60, 64, 67]);
    expect(t.notes[0]).toMatchObject({ time: 0, midi: 60 });
    expect(t.notes[0].duration).toBeCloseTo(0.02, 5);
    expect(t.duration).toBeCloseTo(1.5, 5);
    expect(trimRecording(rec, 1.6, 3).notes.map((n) => n.midi)).toEqual([67]);
    expect(trimLeadingSilence(rec).notes[0].time).toBe(0);
    const q = quantizeRecording(rec, 2); // eighths at 120 bpm = 0.25 s
    expect(q.notes.map((n) => n.time)).toEqual([0.5, 1, 2]);
    const s = scaleRecording(rec, 0.5);
    expect(s.notes[2].time).toBeCloseTo(4, 5);
    expect(s.bpm).toBe(60);
    expect(s.duration).toBeCloseTo(6, 5);
  });
});

describe('WAV encoder', () => {
  it('writes a valid 16-bit PCM header and samples', () => {
    const buf = encodeWav([new Float32Array([0, 1, -1]), new Float32Array([0.5, 0, 0])], 48000);
    const v = new DataView(buf);
    const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    expect(tag(0)).toBe('RIFF');
    expect(tag(8)).toBe('WAVE');
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint32(40, true)).toBe(12);
    expect(buf.byteLength).toBe(56);
    expect(v.getInt16(44 + 4, true)).toBe(32767);
    expect(v.getInt16(44 + 8, true)).toBe(-32768);
  });
});
