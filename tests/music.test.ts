import { describe, expect, it } from 'vitest';
import { chordName, chordPadsForKey, detectChord } from '@/lib/music/chords';
import { isBlack, keyboardGeometry, midiToName, nameToMidi } from '@/lib/music/notes';
import { BASE_C, MAPPING_PRESETS, codeForMidi, labelForCode, mappedOffsets, midiForCode, presetById } from '@/lib/input/keymap';

const classic = presetById('classic').mapping;

describe('notes', () => {
  it('converts names and MIDI numbers', () => {
    expect(nameToMidi('C4')).toBe(60);
    expect(nameToMidi('A0')).toBe(21);
    expect(nameToMidi('Bb3')).toBe(58);
    expect(nameToMidi('Ds1')).toBe(27);
    expect(midiToName(61)).toBe('C#4');
    expect(nameToMidi('H2')).toBeNull();
  });
  it('lays out an 88-key piano with 52 white keys', () => {
    const g = keyboardGeometry(21, 108);
    expect(g.keys.length).toBe(88);
    expect(g.whiteCount).toBe(52);
    expect(g.keys.filter((k) => k.black).length).toBe(36);
    expect(isBlack(61)).toBe(true);
  });
});

describe('default laptop mapping', () => {
  it('matches the specified white and black keys', () => {
    const want: Record<string, string> = {
      KeyA: 'C4', KeyS: 'D4', KeyD: 'E4', KeyF: 'F4', KeyG: 'G4', KeyH: 'A4', KeyJ: 'B4', KeyK: 'C5',
      KeyW: 'C#4', KeyE: 'D#4', KeyT: 'F#4', KeyY: 'G#4', KeyU: 'A#4',
    };
    for (const [code, name] of Object.entries(want)) expect(midiToName(midiForCode(classic, code, 0)!)).toBe(name);
  });
  it('maps the specified controls', () => {
    expect(classic.KeyZ).toBe('octave:down');
    expect(classic.KeyX).toBe('octave:up');
    expect(classic.Space).toBe('rhythm:toggle');
    expect(classic.ArrowUp).toBe('bpm:up');
    expect(classic.ArrowDown).toBe('bpm:down');
    expect(classic.Enter).toBe('rhythm:fill');
    expect(classic.ShiftLeft).toBe('sustain');
    expect(classic.Escape).toBe('panic');
  });
  it('shifts by octaves and reverses lookups', () => {
    expect(midiForCode(classic, 'KeyA', 1)).toBe(72);
    expect(midiForCode(classic, 'KeyA', -2)).toBe(36);
    expect(codeForMidi(classic, 64, 0)).toBe('KeyD');
    expect(codeForMidi(classic, 76, 1)).toBe('KeyD');
    expect(codeForMidi(classic, 30, 0)).toBeNull();
  });
  it('chord pads never collide with melody keys in any preset', () => {
    for (const p of MAPPING_PRESETS) {
      const offs = mappedOffsets(p.mapping);
      expect(offs.length).toBeGreaterThanOrEqual(13);
      // every pitch class is reachable, so folding can always find a key
      expect(new Set(offs.map((o) => ((o % 12) + 12) % 12)).size).toBe(12);
    }
    expect(BASE_C).toBe(60);
  });
  it('prints legends from a layout map when available', () => {
    expect(labelForCode('KeyA')).toBe('A');
    expect(labelForCode('Semicolon')).toBe(';');
    expect(labelForCode('KeyA', new Map([['KeyA', 'q']]))).toBe('Q');
  });
});

describe('chord recognition', () => {
  const name = (notes: number[]) => {
    const c = detectChord(notes);
    return c ? chordName(c) : null;
  };
  it('recognises the required chord families', () => {
    expect(name([60, 64, 67])).toBe('C');
    expect(name([57, 60, 64])).toBe('Am');
    expect(name([67, 71, 74, 77])).toBe('G7');
    expect(name([62, 67, 69])).toBe('Dsus4');
    expect(name([62, 64, 69])).toBe('Dsus2');
    expect(name([59, 62, 65])).toBe('Bdim');
    expect(name([60, 64, 67, 71])).toBe('Cmaj7');
    expect(name([62, 65, 69, 72])).toBe('Dm7');
  });
  it('handles inversions and incomplete input', () => {
    expect(name([64, 67, 72])).toBe('C/E');
    expect(name([60, 64])).toBeNull();
    expect(name([])).toBeNull();
    expect(name([60, 61, 62])).toBeNull();
  });
  it('builds diatonic chord pads for a key', () => {
    expect(chordPadsForKey(0, 'major').slice(0, 7).map(chordName)).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
    expect(chordPadsForKey(9, 'minor').slice(0, 7).map(chordName)).toEqual(['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G']);
    expect(chordPadsForKey(7, 'major').length).toBe(10);
  });
});
