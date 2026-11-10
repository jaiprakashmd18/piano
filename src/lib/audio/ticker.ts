/**
 * A steady ~25 ms tick that keeps running when the tab is in the background.
 * Sequencers use it only to *look ahead*; the actual note times are always
 * expressed on the audio clock, so tick jitter never reaches the sound.
 */
export class Ticker {
  private worker: Worker | null = null;
  private fallback: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();

  constructor(private intervalMs = 25) {}

  add(fn: () => void): () => void {
    this.listeners.add(fn);
    if (this.listeners.size === 1) this.start();
    return () => {
      this.listeners.delete(fn);
      if (this.listeners.size === 0) this.stop();
    };
  }

  private fire = (): void => {
    for (const fn of this.listeners) fn();
  };

  private start(): void {
    try {
      const src = `let id=null;onmessage=e=>{if(e.data==='stop'){clearInterval(id);id=null}else{clearInterval(id);id=setInterval(()=>postMessage(0),e.data)}}`;
      this.worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      this.worker.onmessage = this.fire;
      this.worker.postMessage(this.intervalMs);
    } catch {
      this.worker = null;
      this.fallback = setInterval(this.fire, this.intervalMs);
    }
  }

  private stop(): void {
    this.worker?.postMessage('stop');
    this.worker?.terminate();
    this.worker = null;
    if (this.fallback) clearInterval(this.fallback);
    this.fallback = null;
  }
}

export const ticker = new Ticker();
