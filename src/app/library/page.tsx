'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { NOT_BUNDLED } from '@/data/songs';
import type { Difficulty, Song } from '@/lib/learn/types';
import { formatTime } from '@/lib/hooks';
import { loadAllSongs } from '@/lib/songs';
import { Progress, progressRepo, songRepo } from '@/lib/storage/db';

const DIFFICULTIES: Difficulty[] = ['Beginner', 'Easy', 'Intermediate', 'Advanced'];
const TONE: Record<Difficulty, string> = {
  Beginner: 'text-good border-good/30',
  Easy: 'text-sky-300 border-sky-300/30',
  Intermediate: 'text-accent-soft border-accent/30',
  Advanced: 'text-bad border-bad/30',
};

export default function LibraryPage() {
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [query, setQuery] = useState('');
  const [difficulty, setDifficulty] = useState<'all' | Difficulty>('all');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState<'title' | 'difficulty' | 'bpm' | 'duration'>('difficulty');

  const refresh = () => void loadAllSongs().then(setSongs);
  useEffect(() => {
    refresh();
    void progressRepo.list().then((list) => setProgress(Object.fromEntries(list.map((p) => [p.id, p])))).catch(() => {});
  }, []);

  const categories = useMemo(() => [...new Set((songs ?? []).map((s) => s.category))], [songs]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (songs ?? []).filter(
      (s) =>
        (difficulty === 'all' || s.difficulty === difficulty) &&
        (category === 'all' || s.category === category) &&
        (!q || `${s.title} ${s.artist} ${s.key} ${s.arrangement} ${s.category}`.toLowerCase().includes(q)),
    );
    const rank = (s: Song) => DIFFICULTIES.indexOf(s.difficulty);
    return list.sort((a, b) =>
      sort === 'title' ? a.title.localeCompare(b.title) : sort === 'bpm' ? a.bpm - b.bpm : sort === 'duration' ? a.duration - b.duration : rank(a) - rank(b) || a.title.localeCompare(b.title),
    );
  }, [songs, query, difficulty, category, sort]);

  return (
    <div className="mx-auto max-w-6xl p-3 sm:p-4 lg:p-6 2xl:max-w-[1700px]">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Song Library</h1>
          <p className="text-sm text-zinc-400">Public-domain and original arrangements, plus the MIDI files and recordings you add.</p>
        </div>
        <Link href="/import" className="btn btn-primary">Import a MIDI file</Link>
      </header>

      <div className="panel mt-4 flex flex-wrap items-end gap-3 p-4">
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
          <span className="panel-title">Search</span>
          <input className="field" type="search" placeholder="Title, artist, key…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="panel-title">Difficulty</span>
          <select className="field" value={difficulty} onChange={(e) => setDifficulty(e.target.value as 'all' | Difficulty)}>
            <option value="all">All levels</option>
            {DIFFICULTIES.map((d) => <option key={d}>{d}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="panel-title">Collection</span>
          <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">Everything</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="panel-title">Sort by</span>
          <select className="field" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="difficulty">Difficulty</option>
            <option value="title">Title</option>
            <option value="bpm">Tempo</option>
            <option value="duration">Length</option>
          </select>
        </label>
      </div>

      {songs === null ? (
        <p className="mt-6 text-sm text-zinc-500">Loading songs…</p>
      ) : shown.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-400">No songs match. Clear the search or import your own MIDI file.</p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" data-testid="song-list">
          {shown.map((s) => (
            <li key={s.id} className="panel flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-zinc-100">{s.title}</h2>
                  <p className="truncate text-sm text-zinc-400">{s.artist}</p>
                </div>
                <span className={`chip shrink-0 ${TONE[s.difficulty]}`}>{s.difficulty}</span>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div><dt className="text-zinc-500">Key</dt><dd className="truncate text-zinc-200" title={s.key}>{s.key}</dd></div>
                <div><dt className="text-zinc-500">Tempo</dt><dd className="text-zinc-200">{s.bpm} BPM</dd></div>
                <div><dt className="text-zinc-500">Length</dt><dd className="text-zinc-200">{formatTime(s.duration)}</dd></div>
              </dl>
              <p className="mt-2 text-xs text-zinc-400">{s.arrangement}</p>
              <p className="mt-1 flex-1 text-[11px] leading-relaxed text-zinc-500">{s.license}</p>
              <div className="mt-3 flex items-center gap-2">
                <Link href={`/learn?song=${encodeURIComponent(s.id)}`} className="btn btn-primary btn-sm">Learn</Link>
                {progress[s.id] && <span className="chip !border-accent/40 !text-accent-soft">Best {progress[s.id].bestScore}%</span>}
                {s.source !== 'builtin' && (
                  <button
                    className="btn btn-sm ml-auto"
                    onClick={() => {
                      if (confirm(`Remove "${s.title}" from your library?`)) void songRepo.remove(s.id).then(refresh);
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="panel mt-6 p-5">
        <h2 className="text-base font-semibold text-zinc-100">Looking for a chart or film song?</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">
          Songs such as the ones below are protected by copyright, so Aurora Keys does not ship arrangements of them.
          If you own or have licensed a MIDI arrangement, import it and it will appear here with the full falling-notes tutor.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {NOT_BUNDLED.map((s) => (
            <li key={s.title} className="chip">{s.title} · {s.artist} · not bundled</li>
          ))}
        </ul>
        <Link href="/import" className="btn btn-sm mt-4">Import your own MIDI</Link>
      </section>
    </div>
  );
}
