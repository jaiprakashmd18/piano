import { builtinSongs } from '@/data/songs';
import type { Song } from '@/lib/learn/types';
import { songRepo } from '@/lib/storage/db';

/** Built-in songs plus everything the user imported or recorded (stored locally). */
export async function loadAllSongs(): Promise<Song[]> {
  let mine: Song[] = [];
  try {
    mine = await songRepo.list();
  } catch {
    /* IndexedDB unavailable (private mode etc.): built-ins still work. */
  }
  return [...builtinSongs(), ...mine.sort((a, b) => a.title.localeCompare(b.title))];
}

export async function loadSong(id: string): Promise<Song | null> {
  const builtin = builtinSongs().find((s) => s.id === id);
  if (builtin) return builtin;
  try {
    return (await songRepo.get(id)) ?? null;
  } catch {
    return null;
  }
}
