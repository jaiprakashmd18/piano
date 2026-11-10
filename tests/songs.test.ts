import { describe, expect, it } from 'vitest';
import { SONG_SOURCES, builtinSongs } from '@/data/songs';
import { parseHand } from '@/lib/learn/notation';

describe('built-in song notation', () => {
  for (const src of SONG_SOURCES) {
    it(`${src.id}: every bar has ${src.barBeats} beats and hands line up`, () => {
      const r = parseHand(src.right);
      for (const [i, len] of r.bars.entries()) expect(len, `right bar ${i + 1}`).toBeCloseTo(src.barBeats, 5);
      if (src.left) {
        const l = parseHand(src.left);
        for (const [i, len] of l.bars.entries()) expect(len, `left bar ${i + 1}`).toBeCloseTo(src.barBeats, 5);
        expect(l.totalBeats).toBeCloseTo(r.totalBeats, 5);
      }
    });
  }

  it('builds songs with sorted notes and sane metadata', () => {
    for (const s of builtinSongs()) {
      expect(s.notes.length).toBeGreaterThan(8);
      expect(s.duration).toBeGreaterThan(5);
      for (let i = 1; i < s.notes.length; i++) expect(s.notes[i].time).toBeGreaterThanOrEqual(s.notes[i - 1].time);
      for (const n of s.notes) {
        expect(n.midi).toBeGreaterThanOrEqual(21);
        expect(n.midi).toBeLessThanOrEqual(108);
      }
    }
  });
});
