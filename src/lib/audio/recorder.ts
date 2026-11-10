import * as Tone from 'tone';
import { arranger } from './arranger';
import { buildVoice, engine } from './engine';
import { instrumentById } from './instruments';
import type { RecNote, Recording } from './recording';
import { ticker } from './ticker';
import { encodeWav } from './wav';

export type RecorderState = 'idle' | 'countin' | 'recording';

/** Captures what the player performs (note on/off with timing, honouring the sustain pedal). */
class Recorder {
  state: RecorderState = 'idle';
  /** Beats left in the count-in, for the UI. */
  countdown = 0;
  private listeners = new Set<() => void>();
  private t0 = 0;
  private open = new Map<number, { time: number; velocity: number }>();
  private pedalHeld: { midi: number; time: number; velocity: number }[] = [];
  private notes: RecNote[] = [];
  private unsub: (() => void)[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];
  private usedMetronome = false;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = (): RecorderState => this.state;

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  elapsed(): number {
    return this.state === 'recording' ? Math.max(0, engine.now() - this.t0) : 0;
  }

  start(opts: { countInBeats: number; metronome: boolean }): void {
    if (!engine.ready || this.state !== 'idle') return;
    const beat = 60 / arranger.state.bpm;
    const begin = engine.now() + 0.1;
    this.t0 = begin + opts.countInBeats * beat;
    this.notes = [];
    this.open.clear();
    this.pedalHeld = [];
    this.usedMetronome = opts.metronome && !arranger.state.running;
    for (let i = 0; i < opts.countInBeats; i++) {
      engine.drum(i === 0 ? 'clickHi' : 'clickLo', 0.9, begin + i * beat);
      this.timers.push(
        setTimeout(() => {
          this.countdown = opts.countInBeats - i;
          this.notify();
        }, (begin + i * beat - engine.now()) * 1000),
      );
    }
    this.state = opts.countInBeats > 0 ? 'countin' : 'recording';
    this.countdown = opts.countInBeats;
    this.timers.push(
      setTimeout(() => {
        this.state = 'recording';
        this.countdown = 0;
        this.notify();
      }, (this.t0 - engine.now()) * 1000),
    );
    if (this.usedMetronome) arranger.setMetronome(true, this.t0);

    this.unsub.push(
      engine.notes.on((e) => {
        if (e.source !== 'user') return;
        // Notes played slightly ahead of the downbeat still belong to the take.
        const time = Math.max(0, e.time - this.t0);
        if (e.time < this.t0 - 0.12) return;
        if (e.type === 'on') {
          this.close(e.midi, time);
          this.open.set(e.midi, { time, velocity: e.velocity });
        } else {
          const o = this.open.get(e.midi);
          if (!o) return;
          this.open.delete(e.midi);
          if (engine.sustainOn) this.pedalHeld.push({ midi: e.midi, ...o });
          else this.push(e.midi, o, time);
        }
      }),
      engine.pedalChanged.on((on) => {
        if (on) return;
        const time = Math.max(0, engine.now() - this.t0);
        for (const h of this.pedalHeld) this.push(h.midi, h, time);
        this.pedalHeld = [];
      }),
    );
    this.notify();
  }

  private push(midi: number, o: { time: number; velocity: number }, end: number): void {
    this.notes.push({ midi, time: o.time, duration: Math.max(0.05, end - o.time), velocity: o.velocity });
  }

  /** A re-struck note ends its previous (possibly pedalled) instance. */
  private close(midi: number, time: number): void {
    const o = this.open.get(midi);
    if (o) this.push(midi, o, time);
    this.open.delete(midi);
    this.pedalHeld = this.pedalHeld.filter((h) => {
      if (h.midi !== midi) return true;
      this.push(midi, h, time);
      return false;
    });
  }

  stop(): Recording | null {
    if (this.state === 'idle') return null;
    const wasRecording = this.state === 'recording';
    const end = Math.max(0, engine.now() - this.t0);
    for (const [midi, o] of this.open) this.push(midi, o, end);
    for (const h of this.pedalHeld) this.push(h.midi, h, end);
    this.open.clear();
    this.pedalHeld = [];
    this.unsub.forEach((u) => u());
    this.unsub = [];
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (this.usedMetronome) arranger.setMetronome(false);
    this.state = 'idle';
    this.countdown = 0;
    this.notify();
    if (!wasRecording || this.notes.length === 0) return null;
    const notes = [...this.notes].sort((a, b) => a.time - b.time);
    return {
      id: `rec-${Date.now().toString(36)}`,
      name: `Take ${new Date().toLocaleString()}`,
      createdAt: Date.now(),
      bpm: arranger.state.bpm,
      instrumentId: engine.leadId,
      duration: notes.reduce((d, n) => Math.max(d, n.time + n.duration), 0),
      notes,
    };
  }
}

export const recorder = new Recorder();

/** Plays a recording back through the live engine with sample-accurate scheduling. */
class RecordingPlayer {
  playing = false;
  private listeners = new Set<() => void>();
  private rec: Recording | null = null;
  private speed = 1;
  private anchorAudio = 0;
  private anchorTime = 0;
  private index = 0;
  private untick: (() => void) | null = null;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getPlaying = (): boolean => this.playing;

  position(): number {
    if (!this.playing) return this.anchorTime;
    return this.anchorTime + (engine.now() - this.anchorAudio) * this.speed;
  }

  play(rec: Recording, speed = 1, from = 0): void {
    this.stop();
    if (!engine.ready) return;
    this.rec = rec;
    this.speed = speed;
    this.anchorTime = from;
    this.anchorAudio = engine.now() + 0.08;
    this.index = rec.notes.findIndex((n) => n.time >= from);
    if (this.index < 0) this.index = rec.notes.length;
    this.playing = true;
    this.untick = ticker.add(this.tick);
    this.listeners.forEach((fn) => fn());
  }

  private tick = (): void => {
    const rec = this.rec;
    if (!rec || !this.playing) return;
    const horizon = this.position() + 0.15 * this.speed;
    while (this.index < rec.notes.length && rec.notes[this.index].time < horizon) {
      const n = rec.notes[this.index++];
      engine.playScheduled(n.midi, n.velocity, n.duration / this.speed, this.anchorAudio + (n.time - this.anchorTime) / this.speed, 'playback');
    }
    if (this.position() > rec.duration + 0.3) this.stop(true);
  };

  stop(finished = false): void {
    if (!this.playing) return;
    this.anchorTime = finished ? 0 : this.position();
    this.playing = false;
    this.untick?.();
    this.untick = null;
    if (!finished) engine.cancelScheduled();
    this.listeners.forEach((fn) => fn());
  }
}

export const player = new RecordingPlayer();

/**
 * Renders a recording to WAV faster than real time with an offline audio
 * context, using the same instrument code as live playing.
 */
export async function renderRecordingToWav(rec: Recording): Promise<ArrayBuffer> {
  const def = instrumentById(rec.instrumentId);
  const samples = await engine.loadSamples(def);
  const pcm = engine.drumPcmData();
  const sampleRate = engine.sampleRate();
  const tail = def.kind === 'drums' ? 1.5 : Math.min(4, def.release + 2.5);
  const buffer = await Tone.Offline(
    () => {
      const out = new Tone.Gain(0.8).toDestination();
      const reverb = new Tone.Freeverb({ roomSize: 0.72, dampening: 3500, wet: Math.min(0.35, def.reverb) }).connect(out);
      const voice = buildVoice(def, samples, reverb, (hit, velocity, time) => {
        if (!pcm) return;
        const src = new Tone.ToneBufferSource(Tone.ToneAudioBuffer.fromArray(pcm[hit])).connect(out);
        src.start(time, 0, undefined, velocity);
      });
      for (const n of rec.notes) voice.attackRelease(n.midi, n.duration, n.time + 0.02, n.velocity);
    },
    rec.duration + tail,
    2,
    sampleRate,
  );
  const channels = [buffer.getChannelData(0), buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : buffer.getChannelData(0)];
  return encodeWav(channels, sampleRate);
}

/** Records the live mix (your playing plus accompaniment) and returns it as WAV. */
export class LiveCapture {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  static supported(): boolean {
    return typeof MediaRecorder !== 'undefined' && engine.outputStream() !== null;
  }

  get active(): boolean {
    return this.rec?.state === 'recording';
  }

  start(): void {
    const stream = engine.outputStream();
    if (!stream) throw new Error('Live audio capture is not supported in this browser.');
    this.chunks = [];
    this.rec = new MediaRecorder(stream);
    this.rec.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    this.rec.start(250);
  }

  async stop(): Promise<ArrayBuffer> {
    const rec = this.rec;
    if (!rec) throw new Error('Capture is not running.');
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      rec.stop();
    });
    this.rec = null;
    const blob = new Blob(this.chunks, { type: rec.mimeType });
    const decoded = await Tone.getContext().rawContext.decodeAudioData(await blob.arrayBuffer());
    const channels = [decoded.getChannelData(0), decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : decoded.getChannelData(0)];
    return encodeWav(channels, decoded.sampleRate);
  }
}
