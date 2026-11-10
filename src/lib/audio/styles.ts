import type { DrumHit } from './drumSynth';

/**
 * Rhythm styles. All patterns are original arrangements written for this
 * project in a compact step notation (one character per step).
 *
 * Drums:  x hit, X accent, o ghost note, . rest
 * Bass:   1 3 5 6 7 8 chord degrees (8 = octave), v fifth below, - hold, . rest
 * Keys:   x/X chord stab, 1 3 5 8 single chord tones (arpeggio), - hold, . rest
 * Guitar: d down-strum, u up-strum, m muted strum, - hold, . rest
 */
export type DrumPattern = Partial<Record<DrumHit, string>>;

export interface Variation {
  drums: DrumPattern;
  bass?: string;
  keys?: string;
  guitar?: string;
  /** Sustained chord pad for the whole bar. */
  pad?: boolean;
}

export interface StyleDef {
  id: string;
  name: string;
  group: 'Pop & Rock' | 'Jazz & Blues' | 'Dance' | 'World' | 'Indian';
  bpm: number;
  /** 16 = 4/4 in sixteenths, 12 with 4 steps/beat = 3/4, 12 with 3 steps/beat = 4 beats of triplets. */
  stepsPerBar: number;
  stepsPerBeat: number;
  /** Delay of off-beat sixteenths as a fraction of a step (0 = straight). */
  swing: number;
  keysInst: string;
  guitarInst?: string;
  padInst: string;
  /** Pad plays root + fifth only (tanpura-like drone). */
  drone?: boolean;
  /** Main A..D. Each entry is merged on top of the previous one, so later variations get fuller. */
  variations: [Variation, Partial<Variation>, Partial<Variation>, Partial<Variation>];
  fill: DrumPattern;
}

const FILL_16: DrumPattern = { snare: 'x.x.xxx.x.xxXxXx', tomH: '........x.x.....', tomM: '..........x.x...', tomL: '............x.xx', kick: 'x...x...x...x...' };
const FILL_12T: DrumPattern = { snare: 'x.xx.xx.xXxX', tomM: '......x.x...', tomL: '.........xxx', kick: 'x.....x.....' };
const FILL_WALTZ: DrumPattern = { snare: 'x...x.x.xxXx', kick: 'x...........', tomL: '..........xx' };
const FILL_TABLA: DrumPattern = { na: 'x.xxx.xxx.x.XxXx', ge: 'x...x...x...x.x.', tin: '..x...x...x.....', ke: '.x...x...x...x..' };
const FILL_KUTHU: DrumPattern = { parai: 'XxxXxxXxxXXX', thavilH: 'x.xx.xxxxxxx', thavilL: 'x..x..x..xxx', kick: 'x..x..x..x..' };

export const STYLES: StyleDef[] = [
  {
    id: 'pop', name: 'Pop', group: 'Pop & Rock', bpm: 112, stepsPerBar: 16, stepsPerBeat: 4, swing: 0,
    keysInst: 'epiano', guitarInst: 'acguitar', padInst: 'strings',
    variations: [
      { drums: { kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' }, bass: '1---....1-5-....', keys: 'x---....x---....' },
      { drums: { kick: 'x......xx.x.....', hat: 'X.x.X.x.X.x.X.x.' }, bass: '1--1....1-5-..5.', guitar: 'd...d.u...u.d.u.' },
      { drums: { ohat: '..............x.', tamb: '....x.......x...' }, bass: '1--1..1.5--5..8.', keys: 'x--x..x...x.x...' },
      { drums: { kick: 'x..x...xx.x....x', ride: 'x.x.x.x.x.x.x.x.', hat: '................', crash: 'x...............' }, pad: true, guitar: 'd.dud.u.d.dud.u.' },
    ],
    fill: FILL_16,
  },
  {
    id: 'rock', name: 'Rock', group: 'Pop & Rock', bpm: 124, stepsPerBar: 16, stepsPerBeat: 4, swing: 0,
    keysInst: 'organ', guitarInst: 'elguitar', padInst: 'strings',
    variations: [
      { drums: { kick: 'x.....x.x.......', snare: '....X.......X...', hat: 'X.x.X.x.X.x.X.x.' }, bass: '1.1.1.1.1.1.1.1.', guitar: 'm.m.m.m.m.m.m.m.' },
      { drums: { kick: 'x.....x.x.x.....' }, guitar: 'd-..d-..d-d-..d.', bass: '1.1.1.1.1.1.5.5.' },
      { drums: { ohat: '..............x.', kick: 'x..x..x.x.....x.' }, keys: 'x-------x-------', guitar: 'd.d.d.dud.d.d.du' },
      { drums: { hat: '................', ride: 'X.x.X.x.X.x.X.x.', crash: 'X...............', kick: 'x.x...x.x.x...x.' }, bass: '1.1.8.1.1.1.8.5.' },
    ],
    fill: FILL_16,
  },
  {
    id: 'jazz', name: 'Jazz Swing', group: 'Jazz & Blues', bpm: 132, stepsPerBar: 12, stepsPerBeat: 3, swing: 0,
    keysInst: 'grand', padInst: 'strings',
    variations: [
      { drums: { ride: 'x..x.xx..x.x', hat: '...x.....x..', kick: 'o.....o.....' }, bass: '1..3..5..6..', keys: 'x----x......' },
      { drums: { rim: '.........x..' }, bass: '1..3..5..7..', keys: '.....x---..x' },
      { drums: { snare: '..o.....o..o' }, bass: '1..5..8..7..', keys: 'x-...x.....x' },
      { drums: { kick: 'x....o..x...', crash: 'x...........' }, bass: '8..7..6..5..', keys: 'x-...x-.x..x' },
    ],
    fill: FILL_12T,
  },
  {
    id: 'blues', name: 'Blues Shuffle', group: 'Jazz & Blues', bpm: 104, stepsPerBar: 12, stepsPerBeat: 3, swing: 0,
    keysInst: 'grand', guitarInst: 'elguitar', padInst: 'organ',
    variations: [
      { drums: { hat: 'x.xx.xx.xx.x', kick: 'x.....x.....', snare: '...x.....x..' }, bass: '1.13.35.56.5' },
      { drums: { kick: 'x.....x..x..' }, keys: 'x.xx.x......', guitar: 'm.mm.mm.mm.m' },
      { drums: { hat: 'X.xX.xX.xX.x' }, keys: 'x.xx.xx.xx.x', bass: '1.13.35.67.6' },
      { drums: { hat: '............', ride: 'x.xx.xx.xx.x', crash: 'x...........' }, pad: true, guitar: 'd.ud.ud.ud.u' },
    ],
    fill: FILL_12T,
  },
  {
    id: 'waltz', name: 'Waltz', group: 'World', bpm: 96, stepsPerBar: 12, stepsPerBeat: 4, swing: 0,
    keysInst: 'grand', guitarInst: 'acguitar', padInst: 'strings',
    variations: [
      { drums: { kick: 'x...........', hat: '....x...x...' }, bass: '1---........', keys: '....x-..x-..' },
      { drums: { rim: '....x...x...' }, bass: '1---....5-..', guitar: '....d-..d-..' },
      { drums: { ride: 'x...x...x...' }, pad: true, keys: '1.5.8.5.3.5.' },
      { drums: { snare: '....o...o.o.', crash: 'x...........' }, bass: '1---..3.5-..', keys: '....x-..x-x.' },
    ],
    fill: FILL_WALTZ,
  },
  {
    id: 'disco', name: 'Disco', group: 'Dance', bpm: 120, stepsPerBar: 16, stepsPerBeat: 4, swing: 0,
    keysInst: 'epiano', guitarInst: 'elguitar', padInst: 'strings',
    variations: [
      { drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', ohat: '..x...x...x...x.' }, bass: '1.8.1.8.1.8.1.8.' },
      { drums: { clap: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx' }, guitar: 'm.mum.mum.mum.mu', keys: '..x...x...x...x.' },
      { drums: { tamb: 'x.x.x.x.x.x.x.x.' }, pad: true, bass: '1.8.1.8.5.8.1.87' },
      { drums: { cowbell: 'x...x...x...x...', crash: 'x...............' }, keys: 'x..x..x...x..x..', bass: '1.8.3.8.5.8.6.87' },
    ],
    fill: FILL_16,
  },
  {
    id: 'edm', name: 'Electronic Dance', group: 'Dance', bpm: 128, stepsPerBar: 16, stepsPerBeat: 4, swing: 0,
    keysInst: 'lead', padInst: 'pad',
    variations: [
      { drums: { ekick: 'X...X...X...X...', hat: '..x...x...x...x.' }, bass: '..1...1...1...1.' },
      { drums: { clap: '....x.......x...', ohat: '..x...x...x...x.', hat: 'x.x.x.x.x.x.x.x.' }, pad: true, bass: '..1.1.1...1.1.1.' },
      { drums: { hat: 'xxoxxxoxxxoxxxox' }, keys: 'x..x..x...x..x..' },
      { drums: { esnare: '....x.......x..x', crash: 'x...............', shaker: 'x.x.x.x.x.x.x.x.' }, keys: '1.3.5.8.5.3.1.5.', bass: '1.1.1.1.1.1.1.8.' },
    ],
    fill: { esnare: 'x.x.x.x.xxxxXXXX', ekick: 'x...x...x...x...', clap: '............x.x.' },
  },
  {
    id: '8beat', name: '8 Beat', group: 'Pop & Rock', bpm: 100, stepsPerBar: 16, stepsPerBeat: 4, swing: 0,
    keysInst: 'grand', guitarInst: 'acguitar', padInst: 'strings',
    variations: [
      { drums: { kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' }, bass: '1---..1.5---..5.' },
      { drums: { rim: '................' }, keys: 'x---..x.x---..x.', guitar: 'd.d.d.d.d.d.d.d.' },
      { drums: { kick: 'x.....x.x.x.....', tamb: '....x.......x...' }, pad: true },
      { drums: { ohat: '......x.......x.', crash: 'x...............' }, bass: '1---..1.5--5.87.', keys: 'x-x---x.x-x---x.' },
    ],
    fill: FILL_16,
  },
  {
    id: '16beat', name: '16 Beat', group: 'Pop & Rock', bpm: 96, stepsPerBar: 16, stepsPerBeat: 4, swing: 0.08,
    keysInst: 'epiano', guitarInst: 'elguitar', padInst: 'strings',
    variations: [
      { drums: { kick: 'x..x....x.x.....', snare: '....x..o....x..o', hat: 'XoxoXoxoXoxoXoxo' }, bass: '1..1..5.1..1.58.' },
      { drums: { kick: 'x..x...xx.x.....' }, keys: 'x..x..x.....x...', guitar: 'm.mum.mum.mum.mu' },
      { drums: { ohat: '......x.......x.' }, pad: true, bass: '1..1.15.1..1.587' },
      { drums: { shaker: 'xxxxxxxxxxxxxxxx', crash: 'x...............' }, keys: 'x.xx..x.x..x.x..' },
    ],
    fill: FILL_16,
  },
  {
    id: 'ballad', name: 'Ballad', group: 'Pop & Rock', bpm: 72, stepsPerBar: 16, stepsPerBeat: 4, swing: 0,
    keysInst: 'grand', guitarInst: 'acguitar', padInst: 'strings',
    variations: [
      { drums: { kick: 'x.........x.....', rim: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.' }, bass: '1-------1-------', keys: '1.5.8.5.3.5.8.5.' },
      { drums: { kick: 'x.....x.x.......' }, bass: '1-----1-5-------', pad: true },
      { drums: { snare: '....x.......x...', rim: '................', hat: 'x.x.x.x.x.x.x.x.' }, guitar: 'd---..u.d---..u.' },
      { drums: { ride: 'x.x.x.x.x.x.x.x.', hat: '................', crash: 'x...............' }, bass: '1-----1-5---8-7-', keys: '1.5.8.3.5.8.3.5.' },
    ],
    fill: { snare: '........x...x.xx', tomM: '..........x.....', tomL: '..............xx', kick: 'x.......x.......' },
  },
  {
    id: 'hiphop', name: 'Hip Hop', group: 'Dance', bpm: 90, stepsPerBar: 16, stepsPerBeat: 4, swing: 0.16,
    keysInst: 'epiano', padInst: 'pad',
    variations: [
      { drums: { ekick: 'X......x..x.....', esnare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' }, bass: '1------1..1-....' },
      { drums: { clap: '....x.......x...', hat: 'x.x.x.x.x.xxx.x.' }, keys: 'x-----......x---' },
      { drums: { ekick: 'X..x...x..x..x..', ohat: '......x.........' }, pad: true },
      { drums: { hat: 'x.xxx.x.x.xxxxx.', shaker: '..x...x...x...x.' }, bass: '1--1...1..1-.8..', keys: 'x--x........x-x.' },
    ],
    fill: { esnare: '....x.....x.x.xx', ekick: 'x..x..x.x.......', clap: '............x.x.', hat: 'xxxxxxxx........' },
  },
  {
    id: 'latin', name: 'Latin', group: 'World', bpm: 108, stepsPerBar: 16, stepsPerBeat: 4, swing: 0,
    keysInst: 'grand', guitarInst: 'acguitar', padInst: 'strings',
    variations: [
      { drums: { kick: 'x..x..x.x..x..x.', rim: 'x..x..x...x.x...', shaker: 'x.xxx.xxx.xxx.xx' }, bass: '1--5--8.1--5--8.' },
      { drums: { congaH: '..x...xx..x...xx', congaL: '....x.......x...' }, guitar: 'd..u.ud.d..u.ud.' },
      { drums: { cowbell: 'x...x.x.x...x.x.' }, keys: 'x..x..x..x.x.x..' },
      { drums: { tamb: 'x.x.x.x.x.x.x.x.', crash: 'x...............' }, pad: true, bass: '1--5--8.5--1--53' },
    ],
    fill: { congaH: 'x.xx.xx.xxx.xxxx', congaL: '..x...x...x.x...', tomL: '............x.xx', kick: 'x...x...x...x...' },
  },
  {
    id: 'indian-classical', name: 'Indian Classical (Keherwa)', group: 'Indian', bpm: 92, stepsPerBar: 16, stepsPerBeat: 4, swing: 0,
    keysInst: 'veena', padInst: 'strings', drone: true,
    variations: [
      { drums: { na: 'x...x...x.....x.', ge: 'x.x.........x...', tin: '......x.....x...', ke: '..........x.....' }, pad: true },
      { drums: { na: 'x...x.x.x.....xx', ke: '.x........x..x..' }, keys: '1...5...8...5...' },
      { drums: { ge: 'x.x....x....x.x.', tin: '......x.....x...' }, keys: '1.5.8...5.3.1...' },
      { drums: { na: 'x.x.x.x.x.x...xx', tamb: 'x...x...x...x...' }, keys: '1.3.5.8.5.3.5.8.' },
    ],
    fill: FILL_TABLA,
  },
  {
    id: 'bollywood', name: 'Bollywood', group: 'Indian', bpm: 106, stepsPerBar: 16, stepsPerBeat: 4, swing: 0,
    keysInst: 'epiano', guitarInst: 'acguitar', padInst: 'strings',
    variations: [
      { drums: { kick: 'x...x...x...x...', ge: 'x..x..x.x..x..x.', na: '..x.x..x..x.x..x', tamb: 'x.x.x.x.x.x.x.x.' }, bass: '1..1..5.1..1..5.' },
      { drums: { clap: '....x.......x...' }, pad: true, keys: 'x..x..x.....x.x.' },
      { drums: { tin: '......x.......x.', ke: '.x...x...x...x..' }, guitar: 'd.dud.dud.dud.du' },
      { drums: { snare: '....x.......x...', crash: 'x...............', shaker: 'xxxxxxxxxxxxxxxx' }, bass: '1..1..5.1..8..57', keys: '1.5.8.5.x...x.x.' },
    ],
    fill: FILL_TABLA,
  },
  {
    id: 'tamil-folk', name: 'Tamil Folk', group: 'Indian', bpm: 112, stepsPerBar: 12, stepsPerBeat: 3, swing: 0,
    keysInst: 'veena', guitarInst: 'acguitar', padInst: 'strings',
    variations: [
      { drums: { thavilL: 'x.....x.....', thavilH: '..xx.x..xx.x', tamb: 'x..x..x..x..' }, bass: '1.....5.....' },
      { drums: { parai: 'x.xx.xx.xx.x', kick: 'x.....x.....' }, guitar: 'd..d.ud..d.u' },
      { drums: { clap: '...x.....x..' }, keys: '1..5..8..5..', bass: '1..1..5..5..' },
      { drums: { thavilH: 'x.xxxxx.xxxx', crash: 'x...........' }, pad: true, keys: '1.35.85.31.5' },
    ],
    fill: FILL_KUTHU,
  },
  {
    id: 'kuthu', name: 'Tamil Kuthu', group: 'Indian', bpm: 150, stepsPerBar: 12, stepsPerBeat: 3, swing: 0,
    keysInst: 'lead', guitarInst: 'elguitar', padInst: 'strings',
    variations: [
      { drums: { ekick: 'x..x..x..x..', parai: 'X.xxX.X.xxX.', thavilH: '..x..x..x..x' }, bass: '1.1..15.5..5' },
      { drums: { snare: '......x.....', clap: '...x.....x..' }, keys: 'x..x.x......' },
      { drums: { thavilL: 'x.....x..x..', tamb: 'x.xx.xx.xx.x' }, guitar: 'm.mm.mm.mm.m', bass: '1.1..18.5.58' },
      { drums: { parai: 'XxxXxxXxxXxx', crash: 'x...........' }, pad: true, keys: 'x.xx.xx..x.x' },
    ],
    fill: FILL_KUTHU,
  },
  {
    id: 'dappankuthu', name: 'Dappankuthu', group: 'Indian', bpm: 164, stepsPerBar: 12, stepsPerBeat: 3, swing: 0,
    keysInst: 'lead', padInst: 'strings',
    variations: [
      { drums: { kick: 'x.xx..x.xx..', parai: 'X.xX.xX.xX.x', thavilL: 'x.....x.....' }, bass: '1.1...5.5...' },
      { drums: { snare: '...x.....x..', thavilH: '.x..x..x..x.' }, bass: '1.11..5.55..' },
      { drums: { clap: '...x.....x..', tamb: 'xxxxxxxxxxxx' }, keys: 'x..x..x..x.x' },
      { drums: { parai: 'XxxXxxXxxXxx', kick: 'x.xx.xx.xx.x', crash: 'x...........' }, pad: true, bass: '1.11.85.55.7' },
    ],
    fill: FILL_KUTHU,
  },
  {
    id: 'gaana', name: 'Gaana', group: 'Indian', bpm: 118, stepsPerBar: 16, stepsPerBeat: 4, swing: 0.06,
    keysInst: 'organ', guitarInst: 'acguitar', padInst: 'strings',
    variations: [
      { drums: { kick: 'x..x..x.x..x..x.', parai: '..x...x...x...x.', thavilH: 'x.xxx.xxx.xxx.xx' }, bass: '1..1..5.1..1..5.' },
      { drums: { clap: '....x.......x...', thavilL: 'x.....x.x.....x.' }, keys: '..x...x...x...x.' },
      { drums: { tamb: 'x.x.x.x.x.x.x.x.', parai: '..x..xx...x..xx.' }, guitar: 'd..d..u.d..d..u.' },
      { drums: { snare: '....x.......x.x.', crash: 'x...............' }, pad: true, bass: '1..1..5.1..8.57.' },
    ],
    fill: { parai: 'x.xxx.xxx.xxXXXX', thavilH: 'xxxxxxxxxxxxxxxx', thavilL: 'x...x...x...x.x.', kick: 'x...x...x...x...' },
  },
  {
    id: 'south-cinematic', name: 'South Indian Cinematic', group: 'Indian', bpm: 90, stepsPerBar: 16, stepsPerBeat: 4, swing: 0,
    keysInst: 'grand', padInst: 'strings',
    variations: [
      { drums: { tomL: 'X.....x...x.....', tomM: '...x.....x...x..' }, pad: true, bass: '1-------1-------' },
      { drums: { thavilH: 'o.oxo.oxo.oxo.ox', kick: 'x.......x.......' }, keys: '1.5.8.5.3.5.8.5.' },
      { drums: { thavilL: 'x.....x...x.....', tamb: '....x.......x...' }, bass: '1-----1-5---1---' },
      { drums: { snare: '....x.......x..x', crash: 'X...............', tomH: '......x.......x.' }, bass: '1--1--1-5--5-87.', keys: '1.5.8.3.5.8.x-x-' },
    ],
    fill: { tomH: 'x.x.x...........', tomM: '....x.x.x.x.....', tomL: '........x.x.xxxx', thavilH: 'xxxxxxxxxxxxxxxx', kick: 'x...x...x...x...' },
  },
];

export function styleById(id: string): StyleDef {
  return STYLES.find((s) => s.id === id) ?? STYLES[0];
}

/** Resolves Main A..D: each variation inherits everything from the one before it. */
export function resolveVariation(style: StyleDef, index: number): Variation {
  let v: Variation = { drums: {} };
  for (let i = 0; i <= Math.min(3, Math.max(0, index)); i++) {
    const o = style.variations[i];
    v = { ...v, ...o, drums: { ...v.drums, ...(o.drums ?? {}) } };
  }
  return v;
}

/** Every instrument id a style needs loaded before it can play. */
export function styleInstruments(style: StyleDef): string[] {
  return [...new Set(['bass', style.keysInst, style.padInst, ...(style.guitarInst ? [style.guitarInst] : [])])];
}
