import type { AttackReport } from './trials';

/** Messages to and from the training worker. Only challenges and response bits cross: never a device. */
export interface AttackJob {
  readonly kind: 'attack';
  readonly k: number;
  readonly trainC: Uint8Array;
  readonly trainR: Uint8Array;
  readonly testC: Uint8Array;
  readonly testR: Uint8Array;
  readonly chains: number;
  readonly budgetMs: number;
  readonly restartBelow?: number;
  readonly maxRestarts?: number;
}

export interface CurveJob {
  readonly kind: 'curve';
  readonly k: number;
  readonly sizes: readonly number[];
  readonly poolC: Uint8Array;
  readonly poolR: Uint8Array;
  readonly testC: Uint8Array;
  readonly testR: Uint8Array;
  readonly budgetMs: number;
}

export type WorkerReply =
  | { ok: true; kind: 'attack'; report: AttackReport }
  | { ok: true; kind: 'curve'; points: { n: number; heldOut: number; lo: number; hi: number }[] }
  | { ok: false; error: string };

