import { cryptoRng } from '../rng';
import { Device, randomWeights } from '../puf/device';
import { katWeights } from '../puf/model';

/** The device under attack, shared by the Collect and Attack exhibits. Its weights stay inside Device. */
export type DeviceKind = 'kat' | 'random' | 'flat';

export const DEVICE_LABELS: Record<DeviceKind, string> = {
  kat: 'Device A — the brief\'s check-A weights (reproducible)',
  random: 'A new random device (Gaussian delays)',
  flat: 'A pathological device (every response 0)',
};

export const K = 64;

function build(kind: DeviceKind, noise: number): Device {
  const weights =
    kind === 'kat'
      ? katWeights(K)
      : kind === 'random'
        ? randomWeights(K, cryptoRng)
        : (() => {
            const w = new Float64Array(K + 1);
            w[K] = 5; // Φ_k = 1, so Δ = 5 on every challenge
            return w;
          })();
  return new Device({ weights: [weights], noise, rng: cryptoRng });
}

type Listener = () => void;

class Store {
  kind: DeviceKind = 'kat';
  noise = 0;
  device: Device = build('kat', 0);
  private listeners: Listener[] = [];
  set(kind: DeviceKind, noise: number): void {
    if (kind === this.kind && noise === this.noise) return;
    this.kind = kind;
    this.noise = noise;
    this.device = build(kind, noise);
    for (const l of this.listeners) l();
  }
  onChange(l: Listener): void {
    this.listeners.push(l);
  }
  label(): string {
    return `${DEVICE_LABELS[this.kind]}, noise σ = ${this.noise}`;
  }
}

export const store = new Store();

/** Run a training job in a fresh worker; returns a cancel function. */
export function runWorker<T>(job: unknown, done: (reply: T) => void): () => void {
  const w = new Worker(new URL('../attack/worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent<T>) => {
    w.terminate();
    done(e.data);
  };
  w.postMessage(job);
  return () => w.terminate();
}

export function flatten(cs: readonly Uint8Array[], k: number): Uint8Array {
  const out = new Uint8Array(cs.length * k);
  cs.forEach((c, i) => out.set(c, i * k));
  return out;
}
