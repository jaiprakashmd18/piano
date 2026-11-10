import * as Tone from 'tone';
import { midiToName } from '@/lib/music/notes';
import { DRUM_HITS, DrumHit, renderAllDrums } from './drumSynth';
import { InstrumentDef, SynthPreset, instrumentById } from './instruments';

export type NoteSource = 'user' | 'tutor' | 'playback';

export interface NoteEvent {
  type: 'on' | 'off';
  midi: number;
  velocity: number;
  source: NoteSource;
  /** Audio-clock time of the event. */
  time: number;
}

export type EngineStatus = 'idle' | 'starting' | 'ready' | 'error';

export interface Voice {
  def: InstrumentDef;
  attack(midi: number, time: number, velocity: number): void;
  release(midi: number, time: number): void;
  attackRelease(midi: number, duration: number, time: number, velocity: number): void;
  releaseAll(): void;
  dispose(): void;
}

type SampleSet = Record<string, Tone.ToneAudioBuffer>;
type Listener<T> = (value: T) => void;

class Emitter<T> {
  private set = new Set<Listener<T>>();
  on(fn: Listener<T>): () => void {
    this.set.add(fn);
    return () => this.set.delete(fn);
  }
  emit(v: T): void {
    for (const fn of this.set) fn(v);
  }
}

const SYNTH_OPTIONS: Record<SynthPreset, { synth: Record<string, unknown>; filter?: number }> = {
  organ: {
    synth: {
      oscillator: { type: 'custom', partials: [1, 0.9, 0.55, 0.6, 0, 0.3, 0, 0.4] },
      envelope: { attack: 0.008, decay: 0.01, sustain: 1, release: 0.08 },
    },
  },
  lead: {
    synth: {
      oscillator: { type: 'fatsawtooth', count: 3, spread: 22 },
      envelope: { attack: 0.01, decay: 0.25, sustain: 0.55, release: 0.15 },
    },
    filter: 2800,
  },
  pad: {
    synth: {
      oscillator: { type: 'fatsawtooth', count: 3, spread: 35 },
      envelope: { attack: 0.55, decay: 0.5, sustain: 0.8, release: 1.4 },
    },
    filter: 1500,
  },
};

/** Perceptual velocity curve: single-layer samples need a little help at low velocities. */
function velocityGain(v: number): number {
  return Math.pow(Math.max(0.02, Math.min(1, v)), 1.4);
}

/**
 * Builds a playable voice in whatever Tone context is current, so the same
 * code serves live playing and offline (WAV) rendering.
 */
export function buildVoice(
  def: InstrumentDef,
  samples: SampleSet | null,
  destination: Tone.InputNode,
  drum: (hit: DrumHit, velocity: number, time: number) => void,
): Voice {
  if (def.kind === 'drums') {
    const map = def.drumMap ?? [];
    const hit = (midi: number, time: number, velocity: number) => {
      const h = map[((midi % 12) + 12) % 12];
      if (h) drum(h, velocity, time);
    };
    return { def, attack: hit, release: () => {}, attackRelease: (m, _d, t, v) => hit(m, t, v), releaseAll: () => {}, dispose: () => {} };
  }

  const out = new Tone.Gain(Tone.dbToGain(def.gainDb)).connect(destination);
  let node: Tone.Sampler | Tone.PolySynth;
  const extra: Tone.ToneAudioNode[] = [out];
  if (def.kind === 'sampler') {
    node = new Tone.Sampler({ urls: samples ?? {}, release: def.release, attack: 0 }).connect(out);
  } else {
    const preset = SYNTH_OPTIONS[def.synth ?? 'lead'];
    const poly = new Tone.PolySynth(Tone.Synth, preset.synth as never);
    poly.maxPolyphony = 24;
    if (preset.filter) {
      const filter = new Tone.Filter(preset.filter, 'lowpass');
      poly.connect(filter);
      filter.connect(out);
      extra.push(filter);
    } else {
      poly.connect(out);
    }
    node = poly;
  }
  return {
    def,
    attack: (midi, time, velocity) => node.triggerAttack(midiToName(midi), time, velocityGain(velocity)),
    release: (midi, time) => node.triggerRelease(midiToName(midi), time),
    attackRelease: (midi, duration, time, velocity) =>
      node.triggerAttackRelease(midiToName(midi), duration, time, velocityGain(velocity)),
    releaseAll: () => node.releaseAll(),
    dispose: () => {
      node.dispose();
      for (const n of extra) n.dispose();
    },
  };
}

export class AudioEngine {
  status: EngineStatus = 'idle';
  error: string | null = null;
  leadId = 'grand';

  readonly notes = new Emitter<NoteEvent>();
  readonly statusChanged = new Emitter<EngineStatus>();
  /** Fired when everything is silenced (panic / focus loss) so the UI can clear highlights. */
  readonly cleared = new Emitter<void>();
  readonly loadingChanged = new Emitter<string | null>();
  readonly pedalChanged = new Emitter<boolean>();

  private startPromise: Promise<void> | null = null;
  private sampleCache = new Map<string, Promise<SampleSet>>();
  private voices = new Map<string, Voice>();
  private voiceLoads = new Map<string, Promise<Voice>>();
  private lead: Voice | null = null;

  private master!: Tone.Gain;
  private leadBus!: Tone.Gain;
  private accompBus!: Tone.Gain;
  private drumBus!: Tone.Gain;
  private chorusSend!: Tone.Gain;
  private reverbSend!: Tone.Gain;
  private mediaDest: MediaStreamAudioDestinationNode | null = null;

  private drumPcm: Record<DrumHit, Float32Array> | null = null;
  private drumBuffers = new Map<DrumHit, AudioBuffer>();
  private openHat: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

  private held = new Set<number>();
  private sustained = new Set<number>();
  private pedal = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();

  /** Must be called from a user gesture (click / key press): browsers block audio before that. */
  start(): Promise<void> {
    if (!this.startPromise) {
      this.startPromise = this.boot().catch((e: unknown) => {
        this.error = e instanceof Error ? e.message : String(e);
        this.setStatus('error');
        this.startPromise = null;
        throw e;
      });
    }
    return this.startPromise;
  }

  private setStatus(s: EngineStatus): void {
    this.status = s;
    this.statusChanged.emit(s);
  }

  private async boot(): Promise<void> {
    this.setStatus('starting');
    // lookAhead 0 + "interactive" hint: notes sound as soon as the hardware allows.
    const ctx = new Tone.Context({ latencyHint: 'interactive', lookAhead: 0, updateInterval: 0.02 });
    Tone.setContext(ctx);
    await Tone.start();

    this.master = new Tone.Gain(0.85);
    const limiter = new Tone.Limiter(-1).toDestination();
    this.master.connect(limiter);
    try {
      this.mediaDest = ctx.createMediaStreamDestination();
      limiter.connect(this.mediaDest);
    } catch {
      this.mediaDest = null;
    }

    const reverb = new Tone.Reverb({ decay: 2.6, preDelay: 0.012, wet: 1 });
    await reverb.ready;
    reverb.connect(this.master);
    const chorus = new Tone.Chorus({ frequency: 1.1, delayTime: 3.5, depth: 0.55, wet: 1 }).start();
    chorus.connect(this.master);

    this.leadBus = new Tone.Gain(1).connect(this.master);
    this.accompBus = new Tone.Gain(0.7).connect(this.master);
    this.drumBus = new Tone.Gain(0.8).connect(this.master);
    this.reverbSend = new Tone.Gain(0.2).connect(reverb);
    this.chorusSend = new Tone.Gain(0).connect(chorus);
    this.leadBus.connect(this.reverbSend);
    this.leadBus.connect(this.chorusSend);
    this.accompBus.connect(new Tone.Gain(0.14).connect(reverb));
    this.drumBus.connect(new Tone.Gain(0.07).connect(reverb));

    this.drumPcm = renderAllDrums(ctx.sampleRate);
    for (const hit of DRUM_HITS) {
      const pcm = this.drumPcm[hit];
      const buf = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
      buf.getChannelData(0).set(pcm);
      this.drumBuffers.set(hit, buf);
    }

    // Lets automated browser tests measure the real output signal.
    if (typeof window !== 'undefined') (window as unknown as { __tone?: typeof Tone }).__tone = Tone;
    this.setStatus('ready');
    // The piano loads in the background; the UI shows progress via loadingChanged.
    void this.setInstrument(this.leadId).catch(() => {});
  }

  get ready(): boolean {
    return this.status === 'ready';
  }

  now(): number {
    return this.ready ? Tone.getContext().currentTime : 0;
  }

  /** Output latency reported by the browser, in milliseconds (0 when unknown). */
  latencyMs(): { base: number; output: number } {
    if (!this.ready) return { base: 0, output: 0 };
    const raw = Tone.getContext().rawContext as unknown as { baseLatency?: number; outputLatency?: number };
    return { base: Math.round((raw.baseLatency ?? 0) * 1000), output: Math.round((raw.outputLatency ?? 0) * 1000) };
  }

  sampleRate(): number {
    return this.ready ? Tone.getContext().sampleRate : 44100;
  }

  // ---------------------------------------------------------------- loading

  loadSamples(def: InstrumentDef): Promise<SampleSet> {
    if (def.kind !== 'sampler' || !def.samples) return Promise.resolve({});
    let p = this.sampleCache.get(def.id);
    if (!p) {
      const entries = Object.entries(def.samples);
      p = Promise.all(
        entries.map(async ([note, file]) => {
          const url = `/samples/${def.sampleDir}/${file}`;
          try {
            return [note, await Tone.ToneAudioBuffer.fromUrl(url)] as const;
          } catch {
            throw new Error(`Could not load ${def.name} sample "${file}". Check your connection and try again.`);
          }
        }),
      ).then((pairs) => Object.fromEntries(pairs) as SampleSet);
      p.catch(() => this.sampleCache.delete(def.id));
      this.sampleCache.set(def.id, p);
    }
    return p;
  }

  private loadVoice(key: string, def: InstrumentDef, bus: Tone.Gain): Promise<Voice> {
    const existing = this.voices.get(key);
    if (existing) return Promise.resolve(existing);
    let p = this.voiceLoads.get(key);
    if (!p) {
      p = this.loadSamples(def).then((samples) => {
        const v = buildVoice(def, samples, bus, (h, vel, t) => this.drum(h, vel, t));
        this.voices.set(key, v);
        this.voiceLoads.delete(key);
        return v;
      });
      p.catch(() => this.voiceLoads.delete(key));
      this.voiceLoads.set(key, p);
    }
    return p;
  }

  /** Switches the instrument played from the keyboard. Resolves once it is audible. */
  async setInstrument(id: string): Promise<void> {
    const def = instrumentById(id);
    this.leadId = def.id;
    if (!this.ready) return;
    this.loadingChanged.emit(def.name);
    try {
      const voice = await this.loadVoice(`lead:${def.id}`, def, this.leadBus);
      if (this.leadId !== def.id) return; // user picked something else meanwhile
      this.releaseAllNotes();
      this.lead = voice;
      this.error = null;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      if (this.leadId === def.id) this.loadingChanged.emit(null);
    }
  }

  get leadDef(): InstrumentDef {
    return instrumentById(this.leadId);
  }

  get leadLoaded(): boolean {
    return this.lead?.def.id === this.leadId;
  }

  async loadAccompaniment(ids: string[]): Promise<void> {
    if (!this.ready) return;
    await Promise.all(ids.map((id) => this.loadVoice(`acc:${id}`, instrumentById(id), this.accompBus)));
  }

  // ------------------------------------------------------------ live notes

  noteOn(midi: number, velocity = 0.8, source: NoteSource = 'user'): void {
    if (!this.ready || !this.lead) return;
    const t = Tone.immediate();
    if (this.held.has(midi) || this.sustained.has(midi)) this.lead.release(midi, t);
    this.sustained.delete(midi);
    this.held.add(midi);
    this.lead.attack(midi, t, velocity);
    this.notes.emit({ type: 'on', midi, velocity, source, time: t });
  }

  noteOff(midi: number, source: NoteSource = 'user'): void {
    if (!this.ready || !this.held.has(midi)) return;
    const t = Tone.immediate();
    this.held.delete(midi);
    if (this.pedal) this.sustained.add(midi);
    else this.lead?.release(midi, t);
    this.notes.emit({ type: 'off', midi, velocity: 0, source, time: t });
  }

  setSustain(on: boolean): void {
    if (this.pedal === on) return;
    this.pedal = on;
    this.pedalChanged.emit(on);
    if (!on && this.lead) {
      const t = Tone.immediate();
      for (const m of this.sustained) if (!this.held.has(m)) this.lead.release(m, t);
      this.sustained.clear();
    }
  }

  get sustainOn(): boolean {
    return this.pedal;
  }

  heldNotes(): number[] {
    return [...this.held];
  }

  private releaseAllNotes(): void {
    this.lead?.releaseAll();
    const t = this.now();
    for (const m of this.held) this.notes.emit({ type: 'off', midi: m, velocity: 0, source: 'user', time: t });
    this.held.clear();
    this.sustained.clear();
  }

  /** Stops every sound immediately: held notes, scheduled playback and accompaniment. */
  panic(): void {
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    if (!this.ready) return;
    this.releaseAllNotes();
    for (const v of this.voices.values()) v.releaseAll();
    this.pedal = false;
    this.pedalChanged.emit(false);
    this.cleared.emit();
  }

  /** Releases notes held by the player (used on blur) without touching accompaniment. */
  releaseHeld(): void {
    if (!this.ready) return;
    this.releaseAllNotes();
    this.pedal = false;
    this.pedalChanged.emit(false);
    this.cleared.emit();
  }

  // ------------------------------------------------------- scheduled notes

  /**
   * Plays a note on the lead instrument at an exact audio time (tutor backing,
   * recording playback). Key highlights are emitted when the note sounds.
   */
  playScheduled(midi: number, velocity: number, duration: number, time: number, source: NoteSource): void {
    if (!this.ready || !this.lead) return;
    const when = Math.max(time, this.now());
    this.lead.attackRelease(midi, Math.max(0.03, duration), when, velocity);
    const delayMs = (when - this.now()) * 1000;
    this.later(delayMs, () => this.notes.emit({ type: 'on', midi, velocity, source, time: when }));
    this.later(delayMs + duration * 1000, () => this.notes.emit({ type: 'off', midi, velocity: 0, source, time: when + duration }));
  }

  /** Stops scheduled lead notes (used when the tutor pauses or seeks). */
  cancelScheduled(): void {
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    if (!this.ready) return;
    this.lead?.releaseAll();
    this.held.clear();
    this.sustained.clear();
    this.cleared.emit();
  }

  private later(ms: number, fn: () => void): void {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, Math.max(0, ms));
    this.timers.add(id);
  }

  accompNote(instrumentId: string, midi: number, velocity: number, duration: number, time: number): void {
    this.voices.get(`acc:${instrumentId}`)?.attackRelease(midi, duration, Math.max(time, this.now()), velocity);
  }

  /** Open-ended accompaniment notes (pads); pair with accompRelease. */
  accompAttack(instrumentId: string, midi: number, velocity: number, time: number): void {
    this.voices.get(`acc:${instrumentId}`)?.attack(midi, Math.max(time, this.now()), velocity);
  }

  accompRelease(instrumentId: string, midi: number, time: number): void {
    this.voices.get(`acc:${instrumentId}`)?.release(midi, Math.max(time, this.now()));
  }

  silenceAccompaniment(): void {
    for (const [key, v] of this.voices) if (key.startsWith('acc:')) v.releaseAll();
  }

  drum(hit: DrumHit, velocity: number, time?: number): void {
    if (!this.ready) return;
    const buffer = this.drumBuffers.get(hit);
    if (!buffer) return;
    const ctx = Tone.getContext();
    const when = Math.max(time ?? 0, ctx.currentTime);
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buffer;
    gain.gain.value = Math.max(0, Math.min(1.2, velocity));
    src.connect(gain);
    Tone.connect(gain, this.drumBus);
    src.start(when);
    // A closed hat chokes a ringing open hat, as on a real kit.
    if ((hit === 'hat' || hit === 'ohat') && this.openHat) {
      const g = this.openHat.gain.gain;
      g.setValueAtTime(g.value, when);
      g.linearRampToValueAtTime(0, when + 0.02);
      this.openHat = null;
    }
    if (hit === 'ohat') this.openHat = { src, gain };
  }

  drumPcmData(): Record<DrumHit, Float32Array> | null {
    return this.drumPcm;
  }

  // ------------------------------------------------------------- mix / fx

  setMasterVolume(v: number): void {
    if (this.ready) this.master.gain.rampTo(Math.max(0, Math.min(1, v)), 0.03);
  }
  setReverb(v: number): void {
    if (this.ready) this.reverbSend.gain.rampTo(Math.max(0, Math.min(1, v)), 0.05);
  }
  setChorus(v: number): void {
    if (this.ready) this.chorusSend.gain.rampTo(Math.max(0, Math.min(1, v)), 0.05);
  }
  setLeadVolume(v: number): void {
    if (this.ready) this.leadBus.gain.rampTo(v, 0.03);
  }
  setAccompVolume(v: number): void {
    if (this.ready) this.accompBus.gain.rampTo(v, 0.03);
  }
  setDrumVolume(v: number): void {
    if (this.ready) this.drumBus.gain.rampTo(v, 0.03);
  }

  /** Stream of the final mix, for live WAV capture. */
  outputStream(): MediaStream | null {
    return this.mediaDest?.stream ?? null;
  }
}

/** One engine for the whole app; it survives page navigation. */
export const engine = new AudioEngine();
