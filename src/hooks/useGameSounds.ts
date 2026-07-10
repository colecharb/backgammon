import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useAtomValue } from 'jotai';
import { useEffect, useRef } from 'react';
import { gameStateAtom } from '../state/game';

const diceSound = require('../../assets/sounds/dice.wav');
const moveSound = require('../../assets/sounds/move.wav');

const DICE_VOLUME = 0.9;
const MOVE_VOLUME = 0.7;

/**
 * Plays the dice and checker sound effects off of game-state transitions,
 * for human and computer turns alike: a roll is the move into 'moving' from
 * 'rolling', and every applied move appends exactly one entry to history.
 * Watching the state instead of hooking each action keeps the audio in one
 * place and impossible to forget from a new code path.
 */
export function useGameSounds(): void {
  const game = useAtomValue(gameStateAtom);
  const dice = useAudioPlayer(diceSound);
  const move = useAudioPlayer(moveSound);
  const prev = useRef({ phase: game.phase, historyLength: game.history.length });

  // Let effects be heard even with the iOS ringer switch off.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  useEffect(() => {
    const before = prev.current;
    if (game.phase === 'moving' && before.phase === 'rolling') {
      replay(dice, DICE_VOLUME);
    }
    if (game.history.length > before.historyLength) {
      replay(move, MOVE_VOLUME);
    }
    prev.current = { phase: game.phase, historyLength: game.history.length };
  }, [game, dice, move]);
}

function replay(player: ReturnType<typeof useAudioPlayer>, volume: number): void {
  try {
    player.volume = volume;
    player.seekTo(0);
    player.play();
  } catch {
    // A not-yet-loaded player just misses one cue; never break the turn.
  }
}
