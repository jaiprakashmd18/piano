'use client';

import { AudioGate } from '@/components/AudioGate';
import { ControlBar } from '@/components/ControlBar';
import { KeyLegend } from '@/components/KeyLegend';
import { Piano } from '@/components/Piano';
import { PIANO_HEIGHT, usePerformanceKeys } from '@/lib/hooks';
import { useSettings } from '@/store/settings';

const RANGES: { label: string; low: number; high: number }[] = [
  { label: '88 keys', low: 21, high: 108 },
  { label: '76', low: 28, high: 103 },
  { label: '61', low: 36, high: 96 },
  { label: '49', low: 36, high: 84 },
  { label: '37', low: 48, high: 84 },
  { label: '25', low: 60, high: 84 },
];

export default function PlayPage() {
  usePerformanceKeys();
  const low = useSettings((s) => s.rangeLow);
  const high = useSettings((s) => s.rangeHigh);
  const set = useSettings((s) => s.set);
  const showKeyLabels = useSettings((s) => s.showKeyLabels);
  const showNoteNames = useSettings((s) => s.showNoteNames);

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-3 p-3 sm:gap-4 sm:p-4 lg:p-6 2xl:max-w-[1800px] min-[2300px]:max-w-[2200px]">
      <header className="flex flex-wrap items-end justify-between gap-2 sm:gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">Play Piano</h1>
          <p className="hidden text-sm text-zinc-400 md:block short:hidden">
            Play with <span className="kbd">A</span> <span className="kbd">S</span> <span className="kbd">D</span> <span className="kbd">F</span> <span className="kbd">G</span> <span className="kbd">H</span> <span className="kbd">J</span> <span className="kbd">K</span>, the mouse, or touch.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span className="panel-title hidden sm:inline">Keyboard size</span>
          {RANGES.map((r) => (
            <button key={r.label} className={`btn btn-sm ${r.low === low && r.high === high ? 'btn-on' : ''}`} onClick={() => set({ rangeLow: r.low, rangeHigh: r.high })}>
              {r.label}
            </button>
          ))}
          <label className="ml-2 flex items-center gap-1.5 text-xs text-zinc-400">
            <input type="checkbox" checked={showKeyLabels} onChange={(e) => set({ showKeyLabels: e.target.checked })} /> Key letters
          </label>
          <label className="flex items-center gap-1.5 text-xs text-zinc-400">
            <input type="checkbox" checked={showNoteNames} onChange={(e) => set({ showNoteNames: e.target.checked })} /> Note names
          </label>
        </div>
      </header>
      <AudioGate />
      {/* The instrument comes first so it is on screen without scrolling, even on a phone. */}
      <div className="panel overflow-hidden p-2 pb-3 sm:p-3 sm:pb-4">
        <div className="mb-2 hidden h-2 rounded-t bg-gradient-to-b from-ink-600 to-ink-800 sm:block" />
        <Piano low={low} high={high} height={PIANO_HEIGHT} />
      </div>
      <ControlBar />
      <div className="hidden md:block">
        <KeyLegend />
      </div>
    </div>
  );
}
