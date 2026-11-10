# Aurora Keys

A browser-based piano, arranger keyboard and piano tutor that you play with an ordinary laptop keyboard.
No MIDI keyboard, no account and no backend: everything runs in the browser.

- **Play Piano**: sampled grand piano across 88 keys, 17 more instruments, sustain, reverb, chorus, transpose, metronome.
- **Arranger Keyboard**: 19 rhythm styles with drums, bass, keys, guitar and pads that follow your chords; intro, Main A to D, fill, break, ending, sync start, tap tempo.
- **Learn Songs**: falling notes that show the note name *and* the laptop key, with Wait, Beginner, Practice, Step by Step, Challenge and Listen modes, hand selection, slow practice, loops and scoring.
- **Song Library**: 16 public-domain and original arrangements, searchable and filterable, plus your own imports.
- **MIDI Import**: turns any Standard MIDI File into a lesson and reports honestly how playable it is on a laptop.
- **Recording Studio**: record with count-in and metronome, trim, quantise, change tempo, save projects, export MIDI and WAV.
- **Settings**: fully remappable keys, two layout presets, a keyboard rollover tester, audio latency read-out.

## Default keys

| Keys | Action |
| --- | --- |
| `A S D F G H J K` | White keys C4 to C5 |
| `W E T Y U` | Black keys C#4 to A#4 |
| `O L P ; '` | Continue up to F5 |
| `Z` / `X` | Octave down / up |
| `Shift` | Sustain (hold, or latch: see Settings) |
| `Space` | Start / stop rhythm (play / pause in Learn) |
| `Enter` | Rhythm fill (restart in Learn) |
| `↑` / `↓` | Tempo up / down |
| `1` … `0` | Chord pads for the accompaniment |
| `C V B N M` | Chord colour: major/minor, 7th, sus4, dim, plain |
| `,` `.` `/` | Break, intro/ending, sync start |
| `[` `]` | Previous / next variation |
| `` ` `` | Tap tempo |
| `Esc` | Stop all sound |

Keys are matched by **physical position** (`KeyboardEvent.code`), so the layout is the same on QWERTY, AZERTY, QWERTZ and others; the printed legends are read from the Keyboard Map API where the browser supports it. Every binding can be changed in Settings. A second preset ("Two-hand") spreads 2.4 octaves over the Z-row and Q-row.

## Getting started

Requires Node.js 20 or newer.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000, go to **Play Piano**, click **Enable audio** (browsers block sound until you interact) and press `A`.

### Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Unit tests (Vitest, 71 tests) |
| `npm run test:e2e` | Browser smoke test (needs a running server, see below) |

### Testing

Unit tests cover the deterministic logic: key mapping, chord recognition, rhythm pattern validity, drum synthesis, song notation (every bar is length-checked), song-to-keyboard mapping, scoring, the tutor state machine (Wait, Step, Loop, hands, speed), MIDI import/export including tempo maps, recording edits and the WAV encoder.

```bash
npm test
```

The end-to-end test drives a real Chromium with keyboard events and **measures the audio output level**, so it verifies that keys actually make sound, that sustain works, that all 18 instruments and 19 rhythm styles play, that Wait Mode follows the prompts to a score, that MIDI import, recording, MIDI/WAV export and saved projects work, and that the page is usable at phone size. It needs Playwright with Chromium available to Node (`npm i -D playwright && npx playwright install chromium` if you do not have it).

```bash
npm run build && npm start
```

```bash
npm run test:e2e
```

## Deploying to Vercel

The project is a standard Next.js app with no environment variables and no server code.

1. Push the repository to GitHub.
2. In Vercel choose **Add New → Project**, import the repository and accept the detected Next.js settings.
3. Deploy. Later pushes deploy automatically.

Or from a terminal:

```bash
npx vercel --prod
```

The instrument samples live in `public/samples` (about 6 MB) and are served with a one-year immutable cache header, so after an instrument has loaded once the browser keeps it.

## Project structure

```
src/
  app/                    Next.js routes (one folder per navigation section)
    play/ arranger/ learn/ library/ import/ studio/ settings/
  components/
    AppShell.tsx          Navigation, engine/settings sync, full-screen
    AudioGate.tsx         "Enable audio" + sample loading / error states
    Piano.tsx             88-key keyboard; highlights driven by engine events, not React state
    FallingNotes.tsx      Canvas note lane, redrawn from the audio clock every frame
    ControlBar.tsx        Instrument, mix, octave, transpose, sustain, metronome
    KeyLegend.tsx         Live picture of the laptop keyboard and what each key does
  lib/
    audio/
      engine.ts           Tone.js graph, voices, sustain logic, scheduled notes, drums
      instruments.ts      Instrument definitions and credits
      drumSynth.ts        Procedural drum / tabla / thavil / parai sounds (pure math)
      styles.ts           19 rhythm styles in step notation
      arranger.ts         Look-ahead sequencer: sections, fills, chord-following parts
      recorder.ts         Recorder, playback, offline WAV render, live capture
      recording.ts        Pure edit operations (trim, quantise, scale, transpose)
      ticker.ts           Worker-based look-ahead tick
      wav.ts              WAV encoder and download helpers
    input/
      keymap.ts           Mapping presets, physical-key lookups, legends
      keyboard.ts         keydown/keyup controller (repeat, focus loss, stuck-note safety)
      chordControl.ts     Chord pads, colour modifiers, fingered detection
    learn/
      notation.ts         Compact text notation for built-in songs
      mapping.ts          Song → laptop-key plan with a playability report
      evaluator.ts        Deterministic scoring
      tutor.ts            Tutor state machine (clock, wait, loop, step, backing)
    midi/midi.ts          MIDI parse / export (via @tonejs/midi)
    music/                Notes, keyboard geometry, chords
    storage/db.ts         IndexedDB repositories behind a small interface
  data/songs.ts           Built-in arrangements
  store/settings.ts       Persisted settings (Zustand)
tests/                    Vitest unit tests
e2e/smoke.cjs             Browser smoke test
public/samples/           Self-hosted instrument samples + CREDITS.md
```

### Design notes

- **Timing is independent of React.** Notes are triggered with zero look-ahead on the audio clock. The arranger, tutor and recording player are look-ahead schedulers ticked from a Web Worker and express every event in audio time; the UI only mirrors their state. Key highlights and the falling notes are drawn outside React's render cycle.
- **Stuck-note safety.** Each physical key remembers the exact note it started, auto-repeat is ignored, and everything is released on window blur, tab hide, page change and `Esc`.
- **Storage is behind a `Repository` interface** (`lib/storage/db.ts`), so accounts and cloud sync can be added by swapping the implementation.

## Honest limitations

- **Songs.** Only public-domain and original music is bundled. Copyrighted songs (for example *Perfect*, *Fairytale*, film songs) are **not** included; import a MIDI file you are authorised to use.
- **Laptop keyboards are not pianos.** The default layout covers 1.4 octaves at a time. Wider music is handled by automatic octave following, octave folding, or manual octave keys, and the Learn and Import pages tell you exactly how many notes were affected. Two-hand pieces are approximations; the "Two-hand" layout helps.
- **Ghosting.** Many laptop keyboards cannot register some combinations of three or more keys. This is hardware; use the tester in Settings and the "Keys at once" simplifier in Learn.
- **Latency** depends on your browser and audio device. Notes are triggered immediately, but Bluetooth audio adds roughly 100 to 250 ms. Zero latency is not possible.
- **Samples.** One velocity layer per instrument (loudness changes, tone does not). Instruments from FluidR3 use 3-second samples, so long held notes on strings, flute, sax and violin fade; organ and synths are synthesised and sustain indefinitely.
- **Indian instruments.** The veena voice is the General MIDI sitar (no openly licensed veena multisample was found). Tabla, thavil and parai, and all drum kits, are synthesised models rather than recordings.
- **Rhythm styles** are original patterns "in the style of" each genre, each with a count-in intro, four variations, one fill, a break and an ending. They are not as elaborate as hardware arranger styles.
- **Recording.** MIDI and offline WAV export contain the notes you played on one instrument, not the accompaniment; "Capture live audio to WAV" records the full mix in real time. There is no multitrack or per-note editor yet.
- **Offline use** relies on the browser's HTTP cache; there is no service worker, so the app is not installable.
- **Feedback** is deterministic (note and timing rules). There is no AI feedback.
- **Verification.** Automated tests ran in headless Chromium on Linux. It has not been tested by hand on physical Windows hardware, in Firefox or Safari, or with a real audio device, and it has not been deployed to Vercel from this repository yet.

## Credits

- Grand piano: Salamander Grand Piano V3 by Alexander Holm, CC BY 3.0.
- Other sampled instruments: FluidR3 GM soundfont by Frank Wen, MP3 renders by Benjamin Gleitzman (midi-js-soundfonts), CC BY 3.0.
- Drums, Indian percussion, organ and synths are generated in the browser.
- Built with Next.js, React, TypeScript, Tailwind CSS, Tone.js, @tonejs/midi, Zustand and idb-keyval.

See `public/samples/CREDITS.md` for details.
