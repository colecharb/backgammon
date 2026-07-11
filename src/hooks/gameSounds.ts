import { GamePhase } from '../engine/types';

export interface SoundSnapshot {
  phase: GamePhase;
  historyLength: number;
}

export interface SoundCues {
  /** Dice were thrown — the throw sound. */
  rolled: boolean;
  /** A checker was moved — its arrival sound (fired as the glide lands). */
  moved: boolean;
}

/**
 * Which cues a state transition should fire. Pure and platform-free so it can
 * be unit-tested: the roll cue keys off the rolling -> moving transition,
 * which a computer roll drives exactly as a human tap does, and the move cue
 * off history growing by an applied move (never an undo, which shrinks it).
 */
export function soundsFor(before: SoundSnapshot, after: SoundSnapshot): SoundCues {
  return {
    rolled: after.phase === 'moving' && before.phase === 'rolling',
    moved: after.historyLength > before.historyLength,
  };
}
