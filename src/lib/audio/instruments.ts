import type { DrumHit } from './drumSynth';

export type InstrumentKind = 'sampler' | 'synth' | 'drums';
export type SynthPreset = 'organ' | 'lead' | 'pad';

export interface InstrumentDef {
  id: string;
  name: string;
  category: 'Keys' | 'Guitars & Bass' | 'Orchestral' | 'Synth' | 'Indian' | 'Percussion';
  kind: InstrumentKind;
  description: string;
  /** Sampler: folder under /samples and the sample map (Tone note name -> file). */
  sampleDir?: string;
  samples?: Record<string, string>;
  synth?: SynthPreset;
  /** Drum instruments: sound for each pitch class starting at C. */
  drumMap?: DrumHit[];
  /** Seconds of fade after key release. */
  release: number;
  /** Trim in dB to level-match instruments. */
  gainDb: number;
  /** Default effect sends (0..1). */
  reverb: number;
  chorus: number;
  /** True when the source samples are ~3 s long, so held notes fade by themselves. */
  finiteSustain?: boolean;
  credit: string;
}

const SALAMANDER = 'Salamander Grand Piano V3 by Alexander Holm (CC BY 3.0)';
const FLUID = 'FluidR3 GM soundfont by Frank Wen, rendered by B. Gleitzman (CC BY 3.0)';
const SYNTH = 'Synthesised in the browser (original)';

function salamanderMap(): Record<string, string> {
  const map: Record<string, string> = { A0: 'A0.mp3', C8: 'C8.mp3' };
  for (let o = 1; o <= 7; o++) {
    map[`C${o}`] = `C${o}.mp3`;
    map[`D#${o}`] = `Ds${o}.mp3`;
    map[`F#${o}`] = `Fs${o}.mp3`;
    map[`A${o}`] = `A${o}.mp3`;
  }
  return map;
}

/** FluidR3 files are sampled every minor third: C, Eb, Gb, A. */
function fluidMap(lowMidi: number, highMidi: number): Record<string, string> {
  const names: Record<number, string> = { 0: 'C', 3: 'Eb', 6: 'Gb', 9: 'A' };
  const map: Record<string, string> = {};
  for (let m = lowMidi; m <= highMidi; m++) {
    const n = names[m % 12];
    if (!n) continue;
    const key = `${n}${Math.floor(m / 12) - 1}`;
    map[key] = `${key}.mp3`;
  }
  return map;
}

export const INSTRUMENTS: InstrumentDef[] = [
  {
    id: 'grand', name: 'Grand Piano', category: 'Keys', kind: 'sampler', sampleDir: 'grand', samples: salamanderMap(),
    description: 'Yamaha C5 concert grand, sampled every minor third across all 88 keys.',
    release: 0.7, gainDb: 0, reverb: 0.22, chorus: 0, credit: SALAMANDER,
  },
  {
    id: 'upright', name: 'Upright Piano', category: 'Keys', kind: 'sampler', sampleDir: 'upright', samples: fluidMap(24, 96),
    description: 'Brighter, more intimate piano voice.',
    release: 0.5, gainDb: 3, reverb: 0.12, chorus: 0, finiteSustain: true, credit: FLUID,
  },
  {
    id: 'epiano', name: 'Electric Piano', category: 'Keys', kind: 'sampler', sampleDir: 'epiano', samples: fluidMap(36, 96),
    description: 'Warm tine electric piano.',
    release: 0.5, gainDb: 3, reverb: 0.18, chorus: 0.35, finiteSustain: true, credit: FLUID,
  },
  {
    id: 'organ', name: 'Organ', category: 'Keys', kind: 'synth', synth: 'organ',
    description: 'Drawbar organ built from additive harmonics; sustains for as long as you hold a key.',
    release: 0.08, gainDb: -10, reverb: 0.2, chorus: 0.5, credit: SYNTH,
  },
  {
    id: 'acguitar', name: 'Acoustic Guitar', category: 'Guitars & Bass', kind: 'sampler', sampleDir: 'acguitar', samples: fluidMap(36, 84),
    description: 'Steel-string acoustic guitar.',
    release: 0.6, gainDb: 4, reverb: 0.18, chorus: 0, finiteSustain: true, credit: FLUID,
  },
  {
    id: 'elguitar', name: 'Electric Guitar', category: 'Guitars & Bass', kind: 'sampler', sampleDir: 'elguitar', samples: fluidMap(36, 84),
    description: 'Clean electric guitar.',
    release: 0.5, gainDb: 3, reverb: 0.2, chorus: 0.3, finiteSustain: true, credit: FLUID,
  },
  {
    id: 'bass', name: 'Bass Guitar', category: 'Guitars & Bass', kind: 'sampler', sampleDir: 'bass', samples: fluidMap(24, 60),
    description: 'Finger-style electric bass.',
    release: 0.25, gainDb: 5, reverb: 0.04, chorus: 0, finiteSustain: true, credit: FLUID,
  },
  {
    id: 'violin', name: 'Violin', category: 'Orchestral', kind: 'sampler', sampleDir: 'violin', samples: fluidMap(57, 96),
    description: 'Solo violin.',
    release: 0.25, gainDb: 3, reverb: 0.3, chorus: 0, finiteSustain: true, credit: FLUID,
  },
  {
    id: 'strings', name: 'Strings', category: 'Orchestral', kind: 'sampler', sampleDir: 'strings', samples: fluidMap(36, 96),
    description: 'String ensemble.',
    release: 0.5, gainDb: 2, reverb: 0.35, chorus: 0.15, finiteSustain: true, credit: FLUID,
  },
  {
    id: 'flute', name: 'Flute', category: 'Orchestral', kind: 'sampler', sampleDir: 'flute', samples: fluidMap(60, 96),
    description: 'Concert flute.',
    release: 0.2, gainDb: 3, reverb: 0.3, chorus: 0, finiteSustain: true, credit: FLUID,
  },
  {
    id: 'sax', name: 'Saxophone', category: 'Orchestral', kind: 'sampler', sampleDir: 'sax', samples: fluidMap(48, 81),
    description: 'Alto saxophone.',
    release: 0.2, gainDb: 3, reverb: 0.25, chorus: 0, finiteSustain: true, credit: FLUID,
  },
  {
    id: 'bells', name: 'Bells', category: 'Orchestral', kind: 'sampler', sampleDir: 'bells', samples: fluidMap(48, 84),
    description: 'Tubular bells.',
    release: 1.5, gainDb: 2, reverb: 0.4, chorus: 0, finiteSustain: true, credit: FLUID,
  },
  {
    id: 'lead', name: 'Synth Lead', category: 'Synth', kind: 'synth', synth: 'lead',
    description: 'Fat detuned saw lead.',
    release: 0.15, gainDb: -14, reverb: 0.2, chorus: 0.25, credit: SYNTH,
  },
  {
    id: 'pad', name: 'Synth Pad', category: 'Synth', kind: 'synth', synth: 'pad',
    description: 'Slow, wide analogue-style pad.',
    release: 1.4, gainDb: -14, reverb: 0.45, chorus: 0.5, credit: SYNTH,
  },
  {
    id: 'veena', name: 'Veena (sitar-family sample)', category: 'Indian', kind: 'sampler', sampleDir: 'veena', samples: fluidMap(36, 84),
    description:
      'Plucked Indian lute voice. No openly licensed veena multisample was available, so this uses the General MIDI sitar from FluidR3 as the closest relative.',
    release: 0.8, gainDb: 3, reverb: 0.28, chorus: 0, finiteSustain: true, credit: FLUID,
  },
  {
    id: 'indian-perc', name: 'Tabla & South Indian Percussion', category: 'Indian', kind: 'drums',
    drumMap: ['ge', 'ke', 'na', 'tin', 'na', 'thavilL', 'thavilH', 'parai', 'ke', 'parai', 'tamb', 'ge'],
    description: 'Tabla bols (Na, Tin, Ge, Ke), thavil and parai, one sound per key. Synthesised models, not recordings.',
    release: 0, gainDb: 0, reverb: 0.12, chorus: 0, credit: SYNTH,
  },
  {
    id: 'kit-acoustic', name: 'Drum Kit: Studio', category: 'Percussion', kind: 'drums',
    drumMap: ['kick', 'rim', 'snare', 'clap', 'tomL', 'tomM', 'hat', 'tomH', 'ohat', 'ride', 'cowbell', 'crash'],
    description: 'Kick, snare, hats, toms and cymbals, one sound per key.',
    release: 0, gainDb: 0, reverb: 0.1, chorus: 0, credit: SYNTH,
  },
  {
    id: 'kit-electro', name: 'Drum Kit: Electro', category: 'Percussion', kind: 'drums',
    drumMap: ['ekick', 'rim', 'esnare', 'clap', 'congaL', 'congaH', 'hat', 'shaker', 'ohat', 'tamb', 'cowbell', 'crash'],
    description: 'Drum-machine style kit with latin percussion.',
    release: 0, gainDb: 0, reverb: 0.08, chorus: 0, credit: SYNTH,
  },
];

export function instrumentById(id: string): InstrumentDef {
  return INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[0];
}

export const CREDITS = [
  { name: 'Salamander Grand Piano V3', by: 'Alexander Holm', license: 'CC BY 3.0', url: 'https://github.com/Tonejs/audio' },
  { name: 'FluidR3 GM soundfont (MP3 renders)', by: 'Frank Wen; rendered by Benjamin Gleitzman', license: 'CC BY 3.0', url: 'https://github.com/gleitz/midi-js-soundfonts' },
  { name: 'Drums, tabla, thavil, parai, organ and synths', by: 'Aurora Keys', license: 'Original, generated in the browser', url: '' },
];
