import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { nextComputerAction } from '../ai/ai';
import { defaultNet } from '../ai/weights';
import { computerActionAtom } from '../state/ai';
import { gameStateAtom, playersAtom } from '../state/game';

/**
 * Drives computer-controlled players. Every game-state change re-evaluates
 * what the computer should do next; if it's a computer's decision, one
 * action is dispatched after a short, watchable delay. That dispatch
 * changes the state, which re-runs the effect — so a whole turn unfolds
 * step by step with no stored plan, and any interruption (mode toggle,
 * reset, undo) simply cancels the pending timer.
 */
export function useComputerPlayer(): void {
  const game = useAtomValue(gameStateAtom);
  const players = useAtomValue(playersAtom);
  const dispatch = useSetAtom(computerActionAtom);

  useEffect(() => {
    const next = nextComputerAction(game, players, defaultNet);
    if (!next) return;
    const timer = setTimeout(() => dispatch(next.action), next.delayMs);
    return () => clearTimeout(timer);
  }, [game, players, dispatch]);
}
