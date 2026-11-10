import { arranger } from '@/lib/audio/arranger';
import { engine } from '@/lib/audio/engine';
import { Chord, ChordQuality, chordPadsForKey, detectChord } from '@/lib/music/chords';
import { useSettings } from '@/store/settings';

/** Chord currently selected by a pad, before colour modifiers. */
let baseChord: Chord | null = null;

export function currentPads(): Chord[] {
  const { keyTonic, keyMode } = useSettings.getState();
  return chordPadsForKey(keyTonic, keyMode);
}

export function triggerPad(index: number): void {
  const chord = currentPads()[index];
  if (!chord) return;
  baseChord = chord;
  arranger.setChord(chord);
}

export function setChordDirect(chord: Chord): void {
  baseChord = chord;
  arranger.setChord(chord);
}

export type ChordModifier = 'flip' | '7' | 'sus4' | 'dim' | 'reset';

/** Re-colours the sounding chord without changing its root. */
export function modifyChord(mod: ChordModifier): void {
  const current = arranger.state.chord;
  if (!current) return;
  let quality: ChordQuality = current.quality;
  const minorish = quality === 'min' || quality === 'min7' || quality === 'dim';
  switch (mod) {
    case 'flip':
      quality = quality === 'min7' ? '7' : quality === '7' ? 'min7' : minorish ? 'maj' : 'min';
      break;
    case '7':
      quality = quality === '7' || quality === 'min7' || quality === 'maj7' ? (minorish ? 'min' : 'maj') : minorish ? 'min7' : '7';
      break;
    case 'sus4':
      quality = quality === 'sus4' ? 'maj' : 'sus4';
      break;
    case 'dim':
      quality = quality === 'dim' ? 'min' : 'dim';
      break;
    case 'reset':
      if (baseChord && baseChord.root === current.root) quality = baseChord.quality;
      else quality = minorish ? 'min' : 'maj';
      break;
  }
  arranger.setChord({ root: current.root, quality });
}

/** Fingered mode: recognise the chord from the notes being held. The last chord stays latched. */
export function detectFromHeld(): void {
  if (useSettings.getState().chordMode !== 'fingered') return;
  const chord = detectChord(engine.heldNotes());
  if (chord) {
    baseChord = chord;
    arranger.setChord(chord);
  }
}
