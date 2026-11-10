'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ActionId, KeyMapping, presetById } from '@/lib/input/keymap';
import type { KeyMode } from '@/lib/music/chords';

export type SustainMode = 'hold' | 'toggle';
export type ChordMode = 'pads' | 'fingered';

export interface SettingsState {
  presetId: string;
  /** Active mapping (a preset copy, possibly edited by the user). */
  mapping: KeyMapping;
  octaveShift: number;
  transpose: number;
  /** 0..1 velocity used for laptop keys, which have no touch sensitivity. */
  velocity: number;
  sustainMode: SustainMode;
  masterVolume: number;
  reverb: number;
  chorus: number;
  instrumentId: string;
  /** Visible keyboard range (MIDI). */
  rangeLow: number;
  rangeHigh: number;
  showKeyLabels: boolean;
  showNoteNames: boolean;
  chordMode: ChordMode;
  keyTonic: number;
  keyMode: KeyMode;
  accompVolume: number;
  drumVolume: number;

  set: (patch: Partial<SettingsState>) => void;
  applyPreset: (id: string) => void;
  bindKey: (code: string, action: ActionId | null) => void;
  shiftOctave: (delta: number) => void;
}

export const OCTAVE_MIN = -3;
export const OCTAVE_MAX = 3;

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      presetId: 'classic',
      mapping: presetById('classic').mapping,
      octaveShift: 0,
      transpose: 0,
      velocity: 0.8,
      sustainMode: 'hold',
      masterVolume: 0.85,
      reverb: 0.22,
      chorus: 0,
      instrumentId: 'grand',
      rangeLow: 36,
      rangeHigh: 96,
      showKeyLabels: true,
      showNoteNames: true,
      chordMode: 'pads',
      keyTonic: 0,
      keyMode: 'major',
      accompVolume: 0.7,
      drumVolume: 0.8,

      set: (patch) => set(patch),
      applyPreset: (id) => set({ presetId: id, mapping: { ...presetById(id).mapping } }),
      bindKey: (code, action) => {
        const mapping = { ...get().mapping };
        if (action === null) delete mapping[code];
        else mapping[code] = action;
        set({ mapping, presetId: 'custom' });
      },
      shiftOctave: (delta) => set({ octaveShift: Math.max(OCTAVE_MIN, Math.min(OCTAVE_MAX, get().octaveShift + delta)) }),
    }),
    {
      name: 'aurora-keys-settings',
      version: 1,
      partialize: (s) => {
        const { set: _a, applyPreset: _b, bindKey: _c, shiftOctave: _d, ...rest } = s;
        void _a; void _b; void _c; void _d;
        return rest;
      },
    },
  ),
);
