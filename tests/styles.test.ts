import { describe, expect, it } from 'vitest';
import { STYLES, resolveVariation } from '@/lib/audio/styles';
import { DRUM_HITS, renderDrum } from '@/lib/audio/drumSynth';
import { INSTRUMENTS } from '@/lib/audio/instruments';
import fs from 'node:fs';
import path from 'node:path';

describe('rhythm styles', () => {
  it('includes every requested style family', () => {
    expect(STYLES.length).toBeGreaterThanOrEqual(19);
  });
  for (const style of STYLES) {
    it(`${style.id}: all patterns match the bar length and use known symbols`, () => {
      const check = (label: string, p: string | undefined, allowed: RegExp) => {
        if (p === undefined) return;
        expect(p.length, `${label} length`).toBe(style.stepsPerBar);
        expect(p, label).toMatch(allowed);
      };
      for (let i = 0; i < 4; i++) {
        const v = resolveVariation(style, i);
        for (const [hit, p] of Object.entries(v.drums)) {
          expect(DRUM_HITS).toContain(hit);
          check(`${i} drum ${hit}`, p, /^[xXo.]+$/);
        }
        check(`${i} bass`, v.bass, /^[135678v.\-]+$/);
        check(`${i} keys`, v.keys, /^[xX1358.\-]+$/);
        check(`${i} guitar`, v.guitar, /^[dum.\-]+$/);
        expect(Object.keys(v.drums).length).toBeGreaterThan(0);
      }
      for (const [hit, p] of Object.entries(style.fill)) {
        expect(DRUM_HITS).toContain(hit);
        check(`fill ${hit}`, p, /^[xXo.]+$/);
      }
      const ids = INSTRUMENTS.map((i) => i.id);
      expect(ids).toContain(style.keysInst);
      expect(ids).toContain(style.padInst);
      if (style.guitarInst) expect(ids).toContain(style.guitarInst);
    });
  }
});

describe('drum synthesis', () => {
  it('renders every hit as finite, audible, non-clipping audio', () => {
    for (const hit of DRUM_HITS) {
      const pcm = renderDrum(hit, 44100);
      let peak = 0;
      for (const s of pcm) {
        expect(Number.isFinite(s)).toBe(true);
        peak = Math.max(peak, Math.abs(s));
      }
      expect(peak, hit).toBeGreaterThan(0.3);
      expect(peak, hit).toBeLessThanOrEqual(1);
      expect(Math.abs(pcm[pcm.length - 1])).toBeLessThan(0.01);
    }
  });
});

describe('instrument sample files', () => {
  it('every sample referenced by an instrument exists in public/samples', () => {
    for (const inst of INSTRUMENTS) {
      if (inst.kind !== 'sampler') continue;
      for (const file of Object.values(inst.samples ?? {})) {
        const p = path.join(__dirname, '..', 'public', 'samples', inst.sampleDir!, file);
        expect(fs.existsSync(p), p).toBe(true);
      }
    }
  });
});
