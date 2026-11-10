import { arranger } from '@/lib/audio/arranger';
import { engine } from '@/lib/audio/engine';
import { useSettings } from '@/store/settings';
import { detectFromHeld, modifyChord, triggerPad } from './chordControl';
import { ActionId, BASE_C, noteOffset } from './keymap';
import { PIANO_MAX, PIANO_MIN } from '@/lib/music/notes';

/**
 * Turns physical laptop keys into notes and performance controls.
 *
 * Reliability rules implemented here:
 *  - auto-repeat keydowns never retrigger notes
 *  - each key remembers the exact note it started, so octave/transpose changes
 *    while a key is held can never leave a note stuck
 *  - everything is released when the window loses focus or is hidden
 *  - browser shortcuts (Ctrl/Alt/Meta combos) and text fields are left alone
 */
type KeyListener = (code: string, down: boolean) => void;

class KeyboardController {
  /** Pages switch this off when they need the keys for something else (e.g. remapping). */
  enabled = false;
  private attached = false;
  private active = new Map<string, number>();
  private down = new Set<string>();
  private listeners = new Set<KeyListener>();
  /** Page-specific replacements for control actions (e.g. Space = play/pause in the tutor). */
  overrides: Partial<Record<ActionId, () => void>> = {};

  /** Raw key state stream for on-screen legends and the rollover tester. */
  onKey(fn: KeyListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  pressedCount(): number {
    return this.down.size;
  }

  attach(): void {
    if (this.attached || typeof window === 'undefined') return;
    this.attached = true;
    window.addEventListener('keydown', this.onKeyDown, { capture: true });
    window.addEventListener('keyup', this.onKeyUp, { capture: true });
    window.addEventListener('blur', this.releaseAll);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDown, { capture: true });
    window.removeEventListener('keyup', this.onKeyUp, { capture: true });
    window.removeEventListener('blur', this.releaseAll);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.releaseAll();
  }

  private onVisibility = (): void => {
    if (document.hidden) this.releaseAll();
  };

  releaseAll = (): void => {
    for (const midi of this.active.values()) engine.noteOff(midi);
    this.active.clear();
    for (const code of this.down) for (const fn of this.listeners) fn(code, false);
    this.down.clear();
    engine.releaseHeld();
  };

  private static isTyping(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el || !el.tagName) return false;
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return true;
    if (tag === 'INPUT') {
      const type = (el as HTMLInputElement).type;
      return !['range', 'checkbox', 'radio', 'button', 'file'].includes(type);
    }
    return false;
  }

  /** Keyboard-focused buttons/links keep their normal Space/Enter behaviour for accessibility. */
  private static isActivatingControl(target: EventTarget | null, code: string): boolean {
    if (code !== 'Space' && code !== 'Enter') return false;
    const el = target as HTMLElement | null;
    if (!el || !el.matches) return false;
    return el.matches('button, a, [role="button"], summary') && el.matches(':focus-visible');
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.enabled || e.ctrlKey || e.metaKey || e.altKey) return;
    if (KeyboardController.isTyping(e.target)) return;
    const s = useSettings.getState();
    const action = s.mapping[e.code];
    if (!action) return;
    if (KeyboardController.isActivatingControl(e.target, e.code)) return;
    // The key belongs to the instrument: stop the page scrolling / activating things.
    e.preventDefault();
    const repeatable = action === 'bpm:up' || action === 'bpm:down';
    if (e.repeat && !repeatable) return;
    if (!e.repeat) {
      if (this.down.has(e.code)) return; // duplicate keydown without keyup
      this.down.add(e.code);
      for (const fn of this.listeners) fn(e.code, true);
    }
    if (!engine.ready) {
      // First key press doubles as the user gesture that unlocks audio.
      void engine.start().catch(() => {});
      return;
    }
    this.perform(action, e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (this.down.delete(e.code)) for (const fn of this.listeners) fn(e.code, false);
    const midi = this.active.get(e.code);
    if (midi !== undefined) {
      this.active.delete(e.code);
      engine.noteOff(midi);
      detectFromHeld();
    }
    if (!this.enabled) return;
    const s = useSettings.getState();
    if (s.mapping[e.code] === 'sustain' && s.sustainMode === 'hold') engine.setSustain(false);
  };

  private perform(action: ActionId, code: string): void {
    const s = useSettings.getState();
    const offset = noteOffset(action);
    if (offset !== null) {
      const midi = BASE_C + s.octaveShift * 12 + offset + s.transpose;
      if (midi < PIANO_MIN || midi > PIANO_MAX) return;
      this.active.set(code, midi);
      engine.noteOn(midi, s.velocity);
      arranger.notifyUserNote();
      detectFromHeld();
      return;
    }
    if (action.startsWith('chord:')) {
      if (s.chordMode === 'pads') triggerPad(Number(action.slice(6)));
      return;
    }
    const override = this.overrides[action];
    if (override) {
      override();
      return;
    }
    switch (action) {
      case 'octave:down':
        s.shiftOctave(-1);
        break;
      case 'octave:up':
        s.shiftOctave(1);
        break;
      case 'rhythm:toggle':
        arranger.toggle();
        break;
      case 'rhythm:fill':
        arranger.fill();
        break;
      case 'rhythm:sync':
        arranger.syncStart();
        break;
      case 'rhythm:break':
        arranger.breakBar();
        break;
      case 'rhythm:ending':
        if (arranger.state.running) arranger.ending();
        else arranger.intro();
        break;
      case 'rhythm:prevVar':
        arranger.setVariation((arranger.state.pendingVariation ?? arranger.state.variation) - 1);
        break;
      case 'rhythm:nextVar':
        arranger.setVariation((arranger.state.pendingVariation ?? arranger.state.variation) + 1);
        break;
      case 'bpm:up':
        arranger.nudgeBpm(1);
        break;
      case 'bpm:down':
        arranger.nudgeBpm(-1);
        break;
      case 'tap':
        arranger.tapTempo();
        break;
      case 'sustain':
        engine.setSustain(s.sustainMode === 'toggle' ? !engine.sustainOn : true);
        break;
      case 'panic':
        arranger.stop();
        this.active.clear();
        engine.panic();
        break;
      case 'chordmod:flip':
        modifyChord('flip');
        break;
      case 'chordmod:7':
        modifyChord('7');
        break;
      case 'chordmod:sus4':
        modifyChord('sus4');
        break;
      case 'chordmod:dim':
        modifyChord('dim');
        break;
      case 'chordmod:reset':
        modifyChord('reset');
        break;
    }
  }
}

export const keyboard = new KeyboardController();
