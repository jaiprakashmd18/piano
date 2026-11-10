import { Suspense } from 'react';
import { LearnView } from './LearnView';

export const metadata = { title: 'Learn Songs' };

export default function LearnPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-zinc-500">Loading…</div>}>
      <LearnView />
    </Suspense>
  );
}
