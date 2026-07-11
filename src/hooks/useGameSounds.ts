import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useAtomValue } from 'jotai';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { CHECKER_MOVE_MS } from '../components/board/animation';
import { gameStateAtom } from '../state/game';
import { soundsFor } from './gameSounds';

const diceSound = require('../../assets/sounds/dice.wav');
const moveSound = require('../../assets/sounds/move.wav');

const DICE_VOLUME = 0.9;
const MOVE_VOLUME = 0.7;

type Player = ReturnType<typeof useAudioPlayer>;

/**
 * Plays the dice and checker sound effects off of game-state transitions,
 * for human and computer turns alike: a roll is the move into 'moving' from
 * 'rolling', and every applied move appends one entry to history. Watching
 * the state instead of hooking each action keeps the audio in one place and
 * impossible to forget from a new code path — and makes the roll sound fire
 * for a computer's roll (a timer-driven state change) just as for a human's.
 */
export function useGameSounds(): void {
  const game = useAtomValue(gameStateAtom);
  const dice = useAudioPlayer(diceSound);
  const move = useAudioPlayer(moveSound);
  const prev = useRef({ phase: game.phase, historyLength: game.history.length });
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  // Let effects be heard even with the iOS ringer switch off.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  // On the web, a browser only lets audio play once it is tied to a user
  // gesture — which is why a human's roll is heard but the computer's, fired
  // from a timer, is not. Bless both sounds on the first tap so every later
  // programmatic play is allowed. A no-op off the web.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const doc: Document | undefined = (globalThis as { document?: Document }).document;
    if (!doc) return;
    const unlock = () => {
      for (const player of [dice, move]) {
        try {
          player.volume = 0;
          player.play();
          player.pause();
          player.seekTo(0);
        } catch {
          // Best effort — a failed prime just means the first cue may be quiet.
        }
      }
    };
    doc.addEventListener('pointerdown', unlock, { once: true });
    return () => doc.removeEventListener('pointerdown', unlock);
  }, [dice, move]);

  useEffect(() => {
    const before = prev.current;
    const after = { phase: game.phase, historyLength: game.history.length };
    const { rolled, moved } = soundsFor(before, after);
    if (rolled) replay(dice, DICE_VOLUME);
    if (moved) {
      // The sound is the piece landing, so fire it as the checker's glide
      // reaches its destination rather than the instant the move is applied.
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        replay(move, MOVE_VOLUME);
      }, CHECKER_MOVE_MS);
      timers.current.add(timer);
    }
    prev.current = after;
  }, [game, dice, move]);
}

function replay(player: Player, volume: number): void {
  try {
    player.volume = volume;
    player.seekTo(0);
    player.play();
  } catch {
    // A not-yet-loaded player just misses one cue; never break the turn.
  }
}
