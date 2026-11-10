import { UseStore, createStore, del, get, set, values } from 'idb-keyval';
import type { Recording } from '@/lib/audio/recording';
import type { Song } from '@/lib/learn/types';

/**
 * Local persistence (IndexedDB). Everything goes through this small
 * repository interface so a cloud-synced implementation can replace it later
 * without touching the UI.
 */
export interface Repository<T extends { id: string }> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  save(item: T): Promise<void>;
  remove(id: string): Promise<void>;
}

function idbRepository<T extends { id: string }>(dbName: string): Repository<T> {
  let store: UseStore | null = null;
  const s = (): UseStore => {
    if (typeof indexedDB === 'undefined') throw new Error('Local storage (IndexedDB) is not available in this browser.');
    if (!store) store = createStore(dbName, 'items');
    return store;
  };
  return {
    list: async () => (await values<T>(s())) ?? [],
    get: (id) => get<T>(id, s()),
    save: (item) => set(item.id, item, s()),
    remove: (id) => del(id, s()),
  };
}

export const songRepo: Repository<Song> = idbRepository<Song>('aurora-keys-songs');
export const recordingRepo: Repository<Recording> = idbRepository<Recording>('aurora-keys-recordings');

export interface Progress {
  id: string;
  bestScore: number;
  plays: number;
  lastPlayed: number;
}
export const progressRepo: Repository<Progress> = idbRepository<Progress>('aurora-keys-progress');
