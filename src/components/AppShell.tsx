'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { arranger } from '@/lib/audio/arranger';
import { engine } from '@/lib/audio/engine';
import { detectLayout, useEngineStatus, useUi } from '@/lib/hooks';
import { useSettings } from '@/store/settings';

const NAV = [
  { href: '/', label: 'Home', short: 'Home', icon: 'M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z' },
  { href: '/play', label: 'Play Piano', short: 'Play', icon: 'M4 4h16v16H4zM9 4v10M15 4v10M8 14h2v6M14 14h2v6' },
  { href: '/arranger', label: 'Arranger Keyboard', short: 'Arranger', icon: 'M4 6h16M4 12h16M4 18h16M8 4v4M14 10v4M10 16v4' },
  { href: '/learn', label: 'Learn Songs', short: 'Learn', icon: 'M12 3l9 5-9 5-9-5zM5 11v5c2 2 5 3 7 3s5-1 7-3v-5' },
  { href: '/library', label: 'Song Library', short: 'Library', icon: 'M5 4h3v16H5zM10 4h3v16h-3zM15.5 5l3-.8 3.4 15-3 .8z' },
  { href: '/import', label: 'MIDI Import', short: 'Import', icon: 'M12 3v12M7 10l5 5 5-5M4 20h16' },
  { href: '/studio', label: 'Recording Studio', short: 'Studio', icon: 'M12 3a3 3 0 013 3v6a3 3 0 01-6 0V6a3 3 0 013-3zM6 11a6 6 0 0012 0M12 17v4' },
  { href: '/settings', label: 'Settings', short: 'Settings', icon: 'M12 9a3 3 0 100 6 3 3 0 000-6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4' },
];

/** Keeps the audio engine in step with persisted settings; renders nothing. */
function EngineSync() {
  const status = useEngineStatus();
  useEffect(() => {
    void detectLayout();
    const offLoad = engine.loadingChanged.on((name) => useUi.getState().set({ loadingInstrument: name }));
    return () => {
      offLoad();
    };
  }, []);

  useEffect(() => {
    if (status !== 'ready') return;
    const apply = (s: ReturnType<typeof useSettings.getState>) => {
      engine.setMasterVolume(s.masterVolume);
      engine.setReverb(s.reverb);
      engine.setChorus(s.chorus);
      engine.setAccompVolume(s.accompVolume);
      engine.setDrumVolume(s.drumVolume);
    };
    const load = (id: string) =>
      engine
        .setInstrument(id)
        .then(() => useUi.getState().set({ error: null }))
        .catch((e: unknown) => useUi.getState().set({ error: e instanceof Error ? e.message : String(e) }));
    apply(useSettings.getState());
    void load(useSettings.getState().instrumentId);
    return useSettings.subscribe((s, prev) => {
      apply(s);
      if (s.instrumentId !== prev.instrumentId) void load(s.instrumentId);
    });
  }, [status]);
  return null;
}

function StatusPill() {
  const status = useEngineStatus();
  const loading = useUi((s) => s.loadingInstrument);
  const error = useUi((s) => s.error);
  let text = 'Audio off';
  let tone = 'bg-zinc-600';
  if (status === 'starting') [text, tone] = ['Starting audio…', 'bg-amber-400 animate-pulse'];
  if (status === 'ready') [text, tone] = loading ? [`Loading ${loading}…`, 'bg-amber-400 animate-pulse'] : ['Audio ready', 'bg-good'];
  if (status === 'error' || error) [text, tone] = ['Audio problem', 'bg-bad'];
  return (
    <button
      className="flex w-full items-center gap-2 rounded-lg border border-white/5 bg-ink-900/70 px-3 py-2 text-left text-xs text-zinc-400 hover:border-white/15"
      onClick={() => void engine.start().catch(() => {})}
      title={error ?? engine.error ?? 'Click to (re)start audio'}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${tone}`} />
      <span className="truncate">{text}</span>
    </button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullscreen = useUi((s) => s.fullscreen);

  useEffect(() => {
    const onFs = () => useUi.getState().set({ fullscreen: Boolean(document.fullscreenElement) });
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // Leaving a page never leaves sound running behind it.
  useEffect(() => {
    return () => {
      arranger.stop();
      engine.panic();
    };
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <EngineSync />
      {!fullscreen && (
        <aside className="sticky top-0 z-30 flex shrink-0 items-center border-b border-white/5 bg-ink-900/90 backdrop-blur lg:h-screen lg:w-60 lg:flex-col lg:items-stretch lg:border-b-0 lg:border-r">
          <Link href="/" className="flex shrink-0 items-center gap-3 py-2 pl-3 pr-1 lg:px-4 lg:py-5" aria-label="Aurora Keys home">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-deep text-ink-950 shadow-glow lg:h-9 lg:w-9">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M4 18V8l4-3v13M12 18V6l4-3v15M20 18v-7" />
              </svg>
            </div>
            <div className="hidden lg:block">
              <div className="text-sm font-semibold tracking-wide text-zinc-100">Aurora Keys</div>
              <div className="text-[11px] text-zinc-500">Piano · Arranger · Tutor</div>
            </div>
          </Link>
          <nav aria-label="Main" className="no-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 py-1.5 lg:flex-none lg:flex-col lg:overflow-visible lg:px-3 lg:py-0">
            {NAV.map((n) => {
              const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent lg:gap-3 lg:px-3 lg:text-sm ${
                    active ? 'bg-accent/10 text-accent-soft' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
                  } ${n.href === '/' ? 'hidden lg:flex' : ''}`}
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d={n.icon} />
                  </svg>
                  <span className="whitespace-nowrap">
                    <span className="lg:hidden">{n.short}</span>
                    <span className="hidden lg:inline">{n.label}</span>
                  </span>
                </Link>
              );
            })}
          </nav>
          <div className="hidden px-3 pt-4 lg:block">
            <StatusPill />
          </div>
        </aside>
      )}
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

export function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => useUi.getState().set({ fullscreen: !useUi.getState().fullscreen }));
}
