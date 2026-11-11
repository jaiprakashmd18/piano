'use client';

import { engine } from '@/lib/audio/engine';
import { useEngineStatus, useUi } from '@/lib/hooks';

/**
 * Browsers only allow sound after a user gesture. This banner makes that
 * explicit and also surfaces loading / error states for instrument samples.
 */
export function AudioGate() {
  const status = useEngineStatus();
  const error = useUi((s) => s.error);
  const loading = useUi((s) => s.loadingInstrument);

  if (status === 'ready' && !error && !loading) return null;
  if (status === 'ready' && loading && !error) {
    return (
      <div role="status" className="flex items-center gap-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm text-amber-100">
        <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
        Loading {loading} samples…
      </div>
    );
  }
  if (error || status === 'error') {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
        <span className="flex-1">{error ?? engine.error ?? 'Audio could not be started.'}</span>
        <button
          className="btn btn-sm"
          onClick={() => {
            useUi.getState().set({ error: null });
            void engine
              .start()
              .then(() => engine.setInstrument(engine.leadId))
              .catch((e: unknown) => useUi.getState().set({ error: e instanceof Error ? e.message : String(e) }));
          }}
        >
          Try again
        </button>
      </div>
    );
  }
  return (
    <button
      data-testid="enable-audio"
      onClick={() => void engine.start().catch(() => {})}
      disabled={status === 'starting'}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-accent/40 bg-gradient-to-r from-accent/15 to-transparent px-3 py-2.5 text-left transition hover:border-accent/70 sm:px-5 sm:py-4 short:py-2"
    >
      <span>
        <span className="block text-sm font-semibold text-accent-soft sm:text-base">{status === 'starting' ? 'Starting audio…' : <><span className="sm:hidden">Tap to switch the sound on</span><span className="hidden sm:inline">Click here or press any piano key to switch the sound on</span></>}</span>
        <span className="mt-0.5 hidden text-xs text-zinc-400 sm:block short:hidden">Browsers keep audio muted until you interact with the page. Nothing is recorded or uploaded.</span>
      </span>
      <span className="btn btn-primary pointer-events-none shrink-0">Enable audio</span>
    </button>
  );
}
