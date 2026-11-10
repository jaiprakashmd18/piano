import Link from 'next/link';

const FEATURES = [
  { href: '/play', title: 'Play Piano', text: 'A sampled concert grand across 88 keys, 17 more instruments, sustain, reverb and chorus, all from your laptop keys.' },
  { href: '/arranger', title: 'Arranger Keyboard', text: '19 rhythm styles with drums, bass, keys and guitar that follow your chords. Intro, four variations, fills and endings.' },
  { href: '/learn', title: 'Learn Songs', text: 'Falling notes that show both the note name and the laptop key to press. Wait Mode, slow practice, loops and scoring.' },
  { href: '/library', title: 'Song Library', text: 'Public-domain classics and original pieces, searchable by difficulty and key, plus everything you import.' },
  { href: '/import', title: 'MIDI Import', text: 'Bring your own authorised MIDI files and turn them into laptop-keyboard lessons, with an honest playability report.' },
  { href: '/studio', title: 'Recording Studio', text: 'Record with a count-in, trim and quantise, then export MIDI or WAV. Projects are saved in your browser.' },
];

const KEYS: [string, string][] = [
  ['A S D F G H J K', 'White keys C4 to C5'],
  ['W E T Y U', 'Black keys'],
  ['Z / X', 'Octave down / up'],
  ['Shift', 'Sustain'],
  ['Space', 'Start / stop rhythm'],
  ['Enter', 'Rhythm fill'],
  ['↑ / ↓', 'Tempo'],
  ['1 … 0', 'Chords for the accompaniment'],
  ['Esc', 'Stop all sound'],
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl p-6 lg:p-10">
      <section className="panel relative overflow-hidden p-8 lg:p-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
        <p className="panel-title text-accent">No piano needed</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-zinc-50 lg:text-5xl">
          Your laptop keyboard is the instrument.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-zinc-400">
          Aurora Keys is a piano, an arranger keyboard and a piano teacher in one page. Press <span className="kbd">A</span> for middle C and start playing.
          Free, no account, nothing to install.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/play" className="btn btn-primary px-5 py-3 text-base">Start playing</Link>
          <Link href="/learn" className="btn px-5 py-3 text-base">Learn a song</Link>
          <Link href="/arranger" className="btn px-5 py-3 text-base">Open the arranger</Link>
        </div>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <Link key={f.href} href={f.href} className="panel group p-5 transition hover:border-accent/40">
            <h2 className="text-base font-semibold text-zinc-100 group-hover:text-accent-soft">{f.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{f.text}</p>
          </Link>
        ))}
      </section>

      <section className="panel mt-8 p-6">
        <h2 className="text-base font-semibold text-zinc-100">Default keys</h2>
        <p className="mt-1 text-sm text-zinc-400">Every key can be changed in Settings, and the layout follows physical key positions, so it works on any keyboard language.</p>
        <dl className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {KEYS.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 border-b border-white/5 py-1.5 text-sm">
              <dt className="font-mono text-xs font-semibold text-accent-soft">{k}</dt>
              <dd className="text-zinc-400">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="panel p-6">
          <h2 className="text-base font-semibold text-zinc-100">About the songs</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            The built-in library contains public-domain and original music only. Chart songs and film songs are under copyright, so they are not bundled.
            If you have a MIDI file you are allowed to use, import it and the tutor will teach it with the same falling notes.
          </p>
        </div>
        <div className="panel p-6">
          <h2 className="text-base font-semibold text-zinc-100">About the sound</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            The grand piano is the Salamander Grand (CC BY 3.0); other sampled instruments come from the FluidR3 GM soundfont (CC BY 3.0).
            Drums, tabla, thavil and parai are synthesised in your browser. Full credits are in Settings.
          </p>
        </div>
      </section>
    </div>
  );
}
