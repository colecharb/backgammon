// Synthesizes the game's two placeholder sound effects into this folder.
// These are simple generated tones (no third-party audio), so they can be
// regenerated or tweaked freely: `node assets/sounds/generate.cjs`.
// Swap the .wav files for licensed audio any time — the game just require()s
// whatever lives here.
const fs = require('fs');
const path = require('path');

const SR = 44100;

function toWav(samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

function normalize(out, ceiling = 0.9) {
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > ceiling) {
    const g = ceiling / peak;
    for (let i = 0; i < out.length; i++) out[i] *= g;
  }
  return out;
}

// A single wood-on-wood "knock": a fast noise transient over a short
// decaying tone, mixed into `out` starting at `start` seconds.
function knock(out, start, freq, amp, tau) {
  const s0 = Math.floor(start * SR);
  for (let i = s0; i < out.length; i++) {
    const t = (i - s0) / SR;
    const env = Math.exp(-t / tau);
    if (env < 0.0008) break;
    let s = Math.sin(2 * Math.PI * freq * t) * 0.6;
    s += Math.sin(2 * Math.PI * freq * 2 * t) * 0.2;
    if (t < 0.004) s += (Math.random() * 2 - 1) * 0.7 * (1 - t / 0.004);
    out[i] += s * env * amp;
  }
}

// Checker placed on the board: one soft, quick tock.
function moveSound() {
  const out = new Float32Array(Math.floor(SR * 0.14));
  knock(out, 0, 540, 0.85, 0.03);
  return normalize(out);
}

// Dice thrown: a few knocks tumbling, then a louder final settle.
function diceSound() {
  const out = new Float32Array(Math.floor(SR * 0.52));
  const impacts = [
    [0.0, 360, 0.5, 0.03],
    [0.075, 300, 0.62, 0.03],
    [0.16, 430, 0.55, 0.026],
    [0.255, 330, 0.68, 0.032],
    [0.35, 390, 0.85, 0.05], // the dice come to rest
  ];
  for (const [start, freq, amp, tau] of impacts) knock(out, start, freq, amp, tau);
  return normalize(out);
}

fs.writeFileSync(path.join(__dirname, 'move.wav'), toWav(moveSound()));
fs.writeFileSync(path.join(__dirname, 'dice.wav'), toWav(diceSound()));
console.log('wrote assets/sounds/move.wav and dice.wav');
