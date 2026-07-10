# Sound effects

- `dice.wav` — played when dice are thrown (a roll: `rolling` → `moving`).
- `move.wav` — played when a checker is moved (any entry appended to history).

Both are simple synthesized tones (no third-party audio) produced by
`generate.cjs`. Regenerate or tweak them with:

```sh
node assets/sounds/generate.cjs
```

Feel free to replace either file with licensed audio; `useGameSounds`
(`src/hooks/useGameSounds.ts`) just `require()`s whatever lives here.
