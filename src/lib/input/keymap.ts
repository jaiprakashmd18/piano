/**
 * Laptop-keyboard mapping.
 *
 * Keys are identified by `KeyboardEvent.code` (the physical key position), so
 * the piano layout is identical on QWERTY, AZERTY, QWERTZ, Dvorak, etc. The
 * printed legend for each key is resolved separately (see `labelForCode`).
 */

export type ActionId =
  | `note:${number}`
  | 'octave:down'
  | 'octave:up'
  | 'rhythm:toggle'
  | 'rhythm:fill'
  | 'rhythm:sync'
  | 'rhythm:break'
  | 'rhythm:ending'
  | 'rhythm:prevVar'
  | 'rhythm:nextVar'
  | 'bpm:up'
  | 'bpm:down'
  | 'tap'
  | 'sustain'
  | 'panic'
  | `chord:${number}`
  | 'chordmod:flip'
  | 'chordmod:7'
  | 'chordmod:sus4'
  | 'chordmod:dim'
  | 'chordmod:reset';

export type KeyMapping = Record<string, ActionId>;

export interface MappingPreset {
  id: string;
  name: string;
  description: string;
  mapping: KeyMapping;
}

/** MIDI note of offset 0 when the octave shift is 0 (C4). */
export const BASE_C = 60;

const COMMON: KeyMapping = {
  Space: 'rhythm:toggle',
  ArrowUp: 'bpm:up',
  ArrowDown: 'bpm:down',
  Enter: 'rhythm:fill',
  ShiftLeft: 'sustain',
  ShiftRight: 'sustain',
  Escape: 'panic',
  Backquote: 'tap',
};

const CLASSIC: KeyMapping = {
  // White keys
  KeyA: 'note:0',
  KeyS: 'note:2',
  KeyD: 'note:4',
  KeyF: 'note:5',
  KeyG: 'note:7',
  KeyH: 'note:9',
  KeyJ: 'note:11',
  KeyK: 'note:12',
  // Black keys
  KeyW: 'note:1',
  KeyE: 'note:3',
  KeyT: 'note:6',
  KeyY: 'note:8',
  KeyU: 'note:10',
  // Extension above C5 (same pattern continued to the right)
  KeyO: 'note:13',
  KeyL: 'note:14',
  KeyP: 'note:15',
  Semicolon: 'note:16',
  Quote: 'note:17',
  KeyZ: 'octave:down',
  KeyX: 'octave:up',
  // Chord pads on the digit row: never overlap the melody keys.
  Digit1: 'chord:0',
  Digit2: 'chord:1',
  Digit3: 'chord:2',
  Digit4: 'chord:3',
  Digit5: 'chord:4',
  Digit6: 'chord:5',
  Digit7: 'chord:6',
  Digit8: 'chord:7',
  Digit9: 'chord:8',
  Digit0: 'chord:9',
  // Chord colour modifiers on the bottom row.
  KeyC: 'chordmod:flip',
  KeyV: 'chordmod:7',
  KeyB: 'chordmod:sus4',
  KeyN: 'chordmod:dim',
  KeyM: 'chordmod:reset',
  Comma: 'rhythm:break',
  Period: 'rhythm:ending',
  Slash: 'rhythm:sync',
  BracketLeft: 'rhythm:prevVar',
  BracketRight: 'rhythm:nextVar',
  ...COMMON,
};

const TWO_ROW: KeyMapping = {
  // Lower octave on the bottom two rows (Z = C3)
  KeyZ: 'note:-12',
  KeyS: 'note:-11',
  KeyX: 'note:-10',
  KeyD: 'note:-9',
  KeyC: 'note:-8',
  KeyV: 'note:-7',
  KeyG: 'note:-6',
  KeyB: 'note:-5',
  KeyH: 'note:-4',
  KeyN: 'note:-3',
  KeyJ: 'note:-2',
  KeyM: 'note:-1',
  Comma: 'note:0',
  KeyL: 'note:1',
  Period: 'note:2',
  Semicolon: 'note:3',
  Slash: 'note:4',
  // Upper octaves on the top two rows (Q = C4)
  KeyQ: 'note:0',
  Digit2: 'note:1',
  KeyW: 'note:2',
  Digit3: 'note:3',
  KeyE: 'note:4',
  KeyR: 'note:5',
  Digit5: 'note:6',
  KeyT: 'note:7',
  Digit6: 'note:8',
  KeyY: 'note:9',
  Digit7: 'note:10',
  KeyU: 'note:11',
  KeyI: 'note:12',
  Digit9: 'note:13',
  KeyO: 'note:14',
  Digit0: 'note:15',
  KeyP: 'note:16',
  BracketLeft: 'note:17',
  Minus: 'octave:down',
  Equal: 'octave:up',
  ...COMMON,
};

export const MAPPING_PRESETS: MappingPreset[] = [
  {
    id: 'classic',
    name: 'Classic (A-row piano)',
    description:
      'A S D F G H J K are the white keys from C4, W E T Y U the black keys. Z/X shift octaves, digits 1-0 trigger chords.',
    mapping: CLASSIC,
  },
  {
    id: 'two-row',
    name: 'Two-hand (2.4 octaves)',
    description:
      'Z-row plays C3-E4 and Q-row plays C4-F5, so left and right hand parts fit without octave shifting. - and = shift octaves. Chord pads are on-screen only in this layout.',
    mapping: TWO_ROW,
  },
];

export function presetById(id: string): MappingPreset {
  return MAPPING_PRESETS.find((p) => p.id === id) ?? MAPPING_PRESETS[0];
}

export function noteOffset(action: ActionId | undefined): number | null {
  if (!action || !action.startsWith('note:')) return null;
  return Number(action.slice(5));
}

/** Sorted, de-duplicated semitone offsets reachable with this mapping. */
export function mappedOffsets(mapping: KeyMapping): number[] {
  const set = new Set<number>();
  for (const a of Object.values(mapping)) {
    const o = noteOffset(a);
    if (o !== null) set.add(o);
  }
  return [...set].sort((a, b) => a - b);
}

export function midiForCode(mapping: KeyMapping, code: string, octaveShift: number): number | null {
  const o = noteOffset(mapping[code]);
  return o === null ? null : BASE_C + octaveShift * 12 + o;
}

/** Reverse lookup: the physical key that plays `midi` at the given octave shift. */
export function codeForMidi(mapping: KeyMapping, midi: number, octaveShift: number): string | null {
  const want: ActionId = `note:${midi - BASE_C - octaveShift * 12}`;
  for (const [code, action] of Object.entries(mapping)) if (action === want) return code;
  return null;
}

export function codesForAction(mapping: KeyMapping, action: ActionId): string[] {
  return Object.entries(mapping)
    .filter(([, a]) => a === action)
    .map(([c]) => c);
}

const SPECIAL_LABELS: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  Escape: 'Esc',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Tab: 'Tab',
  CapsLock: 'Caps',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
  AltLeft: 'Alt',
  AltRight: 'Alt',
  Backspace: '⌫',
};

/**
 * Legend to print for a physical key. `layout` is the result of the Keyboard
 * Map API when the browser supports it, giving the real character on the
 * user's layout (e.g. "Q" for KeyA on AZERTY); otherwise US legends are used.
 */
export function labelForCode(code: string, layout?: ReadonlyMap<string, string> | null): string {
  const fromLayout = layout?.get(code);
  if (fromLayout && fromLayout.trim()) return fromLayout.length === 1 ? fromLayout.toUpperCase() : fromLayout;
  if (SPECIAL_LABELS[code]) return SPECIAL_LABELS[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num${code.slice(6)}`;
  return code;
}

export const ACTION_LABELS: Record<string, string> = {
  'octave:down': 'Octave down',
  'octave:up': 'Octave up',
  'rhythm:toggle': 'Start / stop rhythm',
  'rhythm:fill': 'Fill in',
  'rhythm:sync': 'Sync start',
  'rhythm:break': 'Break',
  'rhythm:ending': 'Ending',
  'rhythm:prevVar': 'Previous variation',
  'rhythm:nextVar': 'Next variation',
  'bpm:up': 'Tempo up',
  'bpm:down': 'Tempo down',
  tap: 'Tap tempo',
  sustain: 'Sustain',
  panic: 'Stop all sound',
  'chordmod:flip': 'Chord: major ↔ minor',
  'chordmod:7': 'Chord: add 7th',
  'chordmod:sus4': 'Chord: sus4',
  'chordmod:dim': 'Chord: diminished',
  'chordmod:reset': 'Chord: reset colour',
};

export const CONTROL_ACTIONS = Object.keys(ACTION_LABELS) as ActionId[];

/** Keys we never let the user bind or swallow (browser/OS critical). */
export const RESERVED_CODES = new Set(['MetaLeft', 'MetaRight', 'ContextMenu', 'F5', 'F11', 'F12']);
