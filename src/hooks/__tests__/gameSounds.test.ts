import { describe, expect, it } from 'vitest';
import { GamePhase } from '../../engine/types';
import { soundsFor } from '../gameSounds';

const snap = (phase: GamePhase, historyLength: number) => ({ phase, historyLength });

describe('soundsFor', () => {
  it('fires the roll cue on rolling -> moving (human or computer alike)', () => {
    // Human and computer rolls both drive this exact transition.
    expect(soundsFor(snap('rolling', 3), snap('moving', 3)).rolled).toBe(true);
  });

  it('fires the roll cue on the opening roll from the initial state', () => {
    expect(soundsFor(snap('rolling', 0), snap('moving', 0)).rolled).toBe(true);
  });

  it('does not fire the roll cue when ending a turn', () => {
    expect(soundsFor(snap('moving', 5), snap('rolling', 5)).rolled).toBe(false);
  });

  it('does not fire the roll cue for a double offer', () => {
    expect(soundsFor(snap('rolling', 4), snap('doubled', 4)).rolled).toBe(false);
  });

  it('fires the move cue when a move grows the history', () => {
    expect(soundsFor(snap('moving', 2), snap('moving', 3)).moved).toBe(true);
  });

  it('does not fire the move cue on an undo', () => {
    expect(soundsFor(snap('moving', 3), snap('moving', 2)).moved).toBe(false);
  });

  it('fires nothing on a plain re-render with no change', () => {
    expect(soundsFor(snap('moving', 3), snap('moving', 3))).toEqual({
      rolled: false,
      moved: false,
    });
  });
});
