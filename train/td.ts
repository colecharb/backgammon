// Training-only: nothing under src/ may import from train/.
import { Net } from '../src/ai/network';
import {
  accumulateHeadGradient,
  addToNet,
  makeParamVector,
  ParamVector,
  scaleParams,
  zeroParams,
} from './backprop';

export interface TdConfig {
  /** Learning rate α. */
  alpha: number;
  /** Trace decay λ. λ=0 removes all trace subtlety (plain one-step TD). */
  lambda: number;
}

/**
 * TD(λ) eligibility traces, one per output head, kept in the frame of the
 * player currently on roll.
 *
 * The net always evaluates for the on-roll player, so the frame alternates
 * every half-move. Folding the frame change into the classical fixed-frame
 * TD(λ) recursion gives (derivation: substitute V_white = L∘V_hero into
 * e ← λe + ∇V_white, with L the linear part of the flip — negate head 0,
 * swap heads 1↔3 and 2↔4; L is an involution):
 *
 *   traces ← λ·L(traces) + ∇V(s_t)        (in the on-roll player's frame)
 *   net    += α · Σₖ δₖ · tracesₖ          δ = flip(V(s_t+1)) − V(s_t)
 *
 * with terminal δ = z − V(s_T), z the actual result in the frame of the
 * player who just moved.
 */
export interface TdState {
  traces: ParamVector[];
  hiddenScratch: Float32Array;
}

export function makeTdState(net: Net): TdState {
  return {
    traces: Array.from({ length: net.outputs }, () => makeParamVector(net)),
    hiddenScratch: new Float32Array(net.hidden),
  };
}

/** Call at the start of every episode. */
export function resetTraces(td: TdState): void {
  for (const trace of td.traces) zeroParams(trace);
}

/**
 * One online TD(λ) step for the transition out of state s_t. `x`, `h`, `o`
 * are the forward pass at s_t (in the on-roll player's frame); `delta` is
 * the 5-head TD error in that same frame, computed by the caller *before*
 * this call mutates the weights.
 */
export function tdStep(
  net: Net,
  td: TdState,
  cfg: TdConfig,
  x: Float32Array,
  h: Float32Array,
  o: Float32Array,
  delta: Float32Array,
): void {
  const { alpha, lambda } = cfg;
  const [t0, t1, t2, t3, t4] = td.traces;

  // traces ← λ·L(traces): head 0 sees its own past negated (win↔lose),
  // heads 1↔3 and 2↔4 inherit each other's past (gammons change sides).
  scaleParams(t0, -lambda);
  scaleParams(t1, lambda);
  scaleParams(t2, lambda);
  scaleParams(t3, lambda);
  scaleParams(t4, lambda);
  td.traces[0] = t0;
  td.traces[1] = t3;
  td.traces[2] = t4;
  td.traces[3] = t1;
  td.traces[4] = t2;

  for (let k = 0; k < net.outputs; k++) {
    accumulateHeadGradient(net, td.traces[k], k, x, h, o, td.hiddenScratch);
  }
  for (let k = 0; k < net.outputs; k++) {
    addToNet(net, td.traces[k], alpha * delta[k]);
  }
}
