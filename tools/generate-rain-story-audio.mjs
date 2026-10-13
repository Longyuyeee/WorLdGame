import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const output = path.resolve(import.meta.dirname, '../assets/rain-story');
await mkdir(output, { recursive: true });
const rate = 22050;
function wav(seconds, render) {
  const count = Math.round(seconds * rate), bytes = Buffer.alloc(44 + count * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(count * 2, 40);
  for (let sample = 0; sample < count; sample++) bytes.writeInt16LE(Math.round(Math.max(-.9, Math.min(.9, render(sample / rate, sample))) * 32767), 44 + sample * 2);
  return bytes;
}
const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
const chords = [[57, 60, 64], [53, 57, 60], [48, 55, 60], [55, 59, 62]];
const melody = [64, 67, 69, 67, 64, 60, 62, 64, 65, 69, 67, 65, 64, 62, 60, 59];
function note(midi, age, duration, level) {
  if (age < 0 || age >= duration) return 0;
  const f = frequency(midi), attack = Math.min(1, age / .025), release = Math.min(1, (duration - age) / .12);
  return level * attack * release * Math.exp(-age * 1.6) * (Math.sin(2 * Math.PI * f * age) + .22 * Math.sin(4 * Math.PI * f * age));
}
await writeFile(path.join(output, 'night-travel-theme.wav'), wav(32, t => {
  let value = 0;
  const beat = Math.floor(t / .5), local = t - beat * .5;
  value += note(melody[beat % melody.length], local, .5, .13);
  for (let old = 0; old < 4; old++) {
    const at = beat - old; if (at < 0) continue;
    const chord = chords[Math.floor(at / 8) % chords.length];
    value += note(chord[at % 3] - 12, t - at * .5, 2, .04);
  }
  return value * Math.min(1, t / .8, (32 - t) / .8);
}));
let seed = 0x7139, previous = 0;
await writeFile(path.join(output, 'soft-rain.wav'), wav(12, t => {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  previous = previous * .76 + (((seed >>> 0) / 0xffffffff) * 2 - 1) * .24;
  return previous * .32 * Math.min(1, t / .4, (12 - t) / .4);
}));
await writeFile(path.join(output, 'station-chime.wav'), wav(1.5, t => note(76, t, 1.5, .18) + note(79, t - .22, 1.2, .12)));
console.log(JSON.stringify({ files: ['night-travel-theme.wav', 'soft-rain.wav', 'station-chime.wav'], format: 'mono PCM16 22050 Hz', source: 'original deterministic synthesis' }));
