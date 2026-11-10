'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { arranger, ArrangerState } from '@/lib/audio/arranger';
import { engine, EngineStatus } from '@/lib/audio/engine';
import { keyboard } from '@/lib/input/keyboard';

export function useEngineStatus(): EngineStatus {
  return useSyncExternalStore(
    (fn) => engine.statusChanged.on(fn),
    () => engine.status,
    () => 'idle' as EngineStatus,
  );
}

const serverArranger = arranger.getState();
export function useArranger(): ArrangerState {
  return useSyncExternalStore(arranger.subscribe, arranger.getState, () => serverArranger);
}

/** Routes the laptop keyboard to the instrument while the calling page is mounted. */
export function usePerformanceKeys(active = true): void {
  useEffect(() => {
    if (!active) return;
    keyboard.attach();
    keyboard.enabled = true;
    // After a mouse click, hand focus back to the page so Space/Enter play instead of re-clicking the button.
    const blurAfterClick = (e: PointerEvent) => {
      if (e.pointerType === '') return;
      const el = document.activeElement as HTMLElement | null;
      if (el && el.matches('button, a, [role="button"], input[type="range"], input[type="checkbox"]')) el.blur();
    };
    window.addEventListener('pointerup', blurAfterClick);
    return () => {
      keyboard.enabled = false;
      keyboard.overrides = {};
      keyboard.releaseAll();
      window.removeEventListener('pointerup', blurAfterClick);
    };
  }, [active]);
}

interface UiState {
  /** Printed legends for the user's physical layout (Keyboard Map API), when available. */
  layout: ReadonlyMap<string, string> | null;
  loadingInstrument: string | null;
  error: string | null;
  fullscreen: boolean;
  set: (p: Partial<UiState>) => void;
}

export const useUi = create<UiState>((set) => ({
  layout: null,
  loadingInstrument: null,
  error: null,
  fullscreen: false,
  set: (p) => set(p),
}));

type KeyboardApi = { getLayoutMap?: () => Promise<ReadonlyMap<string, string>> };

export async function detectLayout(): Promise<void> {
  const kb = (navigator as unknown as { keyboard?: KeyboardApi }).keyboard;
  if (!kb?.getLayoutMap) return;
  try {
    useUi.getState().set({ layout: await kb.getLayoutMap() });
  } catch {
    /* Permission denied or unsupported: US legends are used. */
  }
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
