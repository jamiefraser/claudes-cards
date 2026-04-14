#!/usr/bin/env node
/**
 * scripts/generate-sounds.js
 *
 * Generates synthesised CC0 sound assets per SPEC.md §10.3.
 * Outputs MP3 files to apps/frontend/src/sound/assets/
 *
 * Requires: ffmpeg in PATH (for WAV→MP3 conversion)
 *
 * Generated sounds:
 *   phase-complete.mp3  — C4→E4→G4 rising arpeggio, 350ms, sine wave
 *   skip-played.mp3     — descending swoosh, 200ms, sawtooth wave
 *   peg-move.mp3        — wooden click, 80ms, synthesised percussion
 *
 * Usage: node scripts/generate-sounds.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const OUTPUT_DIR = path.resolve(__dirname, '../apps/frontend/src/sound/assets');

// ── Utility: write a minimal WAV file from PCM samples ────────────────────────

/**
 * Writes a 16-bit PCM mono WAV file.
 * @param {string} filePath
 * @param {Float32Array} samples  — values in range [-1, 1]
 * @param {number} sampleRate
 */
function writeWav(filePath, samples, sampleRate) {
  const numSamples = samples.length;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const buf = Buffer.alloc(totalSize);
  let offset = 0;

  // RIFF header
  buf.write('RIFF', offset); offset += 4;
  buf.writeUInt32LE(totalSize - 8, offset); offset += 4;
  buf.write('WAVE', offset); offset += 4;

  // fmt chunk
  buf.write('fmt ', offset); offset += 4;
  buf.writeUInt32LE(16, offset); offset += 4;         // chunk size
  buf.writeUInt16LE(1, offset); offset += 2;           // PCM
  buf.writeUInt16LE(numChannels, offset); offset += 2;
  buf.writeUInt32LE(sampleRate, offset); offset += 4;
  buf.writeUInt32LE(byteRate, offset); offset += 4;
  buf.writeUInt16LE(blockAlign, offset); offset += 2;
  buf.writeUInt16LE(bitsPerSample, offset); offset += 2;

  // data chunk
  buf.write('data', offset); offset += 4;
  buf.writeUInt32LE(dataSize, offset); offset += 4;

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = Math.round(clamped * 32767);
    buf.writeInt16LE(int16, offset); offset += 2;
  }

  fs.writeFileSync(filePath, buf);
}

/**
 * Convert a WAV file to MP3 using ffmpeg.
 * @param {string} wavPath
 * @param {string} mp3Path
 */
function wavToMp3(wavPath, mp3Path) {
  try {
    execSync(`ffmpeg -y -i "${wavPath}" -q:a 2 "${mp3Path}" 2>/dev/null`, {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

// ── Sound synthesisers ─────────────────────────────────────────────────────────

const SAMPLE_RATE = 44100;

/**
 * phase-complete.mp3
 * Rising C4→E4→G4 arpeggio, 350ms total, sine wave with fade-out.
 */
function generatePhaseComplete() {
  const totalMs = 350;
  const totalSamples = Math.floor((SAMPLE_RATE * totalMs) / 1000);
  const samples = new Float32Array(totalSamples);

  // Frequencies: C4=261.63Hz, E4=329.63Hz, G4=392.00Hz
  const notes = [261.63, 329.63, 392.0];
  const noteDurationSamples = Math.floor(totalSamples / notes.length);

  let sampleIdx = 0;
  for (let n = 0; n < notes.length; n++) {
    const freq = notes[n];
    const noteLen = n < notes.length - 1 ? noteDurationSamples : totalSamples - sampleIdx;
    for (let i = 0; i < noteLen; i++) {
      const t = i / SAMPLE_RATE;
      const envelope = Math.exp(-t * 8); // fast decay
      samples[sampleIdx++] = 0.5 * Math.sin(2 * Math.PI * freq * t) * envelope;
    }
  }

  // Global fade-out over last 20ms
  const fadeLen = Math.floor((SAMPLE_RATE * 20) / 1000);
  for (let i = 0; i < fadeLen; i++) {
    samples[totalSamples - fadeLen + i] *= (fadeLen - i) / fadeLen;
  }

  return samples;
}

/**
 * skip-played.mp3
 * Descending swoosh, 200ms, sawtooth wave with pitch glide.
 */
function generateSkipPlayed() {
  const totalMs = 200;
  const totalSamples = Math.floor((SAMPLE_RATE * totalMs) / 1000);
  const samples = new Float32Array(totalSamples);

  const startFreq = 800;
  const endFreq = 200;

  for (let i = 0; i < totalSamples; i++) {
    const progress = i / totalSamples;
    const freq = startFreq + (endFreq - startFreq) * progress;
    const t = i / SAMPLE_RATE;

    // Sawtooth wave: 2*(t*freq - floor(t*freq + 0.5))
    const phase = t * freq - Math.floor(t * freq + 0.5);
    const sawtooth = 2 * phase;

    const envelope = (1 - progress) * Math.exp(-progress * 3);
    samples[i] = 0.4 * sawtooth * envelope;
  }

  return samples;
}

/**
 * peg-move.mp3
 * Short wooden click, 80ms, synthesised percussion hit.
 */
function generatePegMove() {
  const totalMs = 80;
  const totalSamples = Math.floor((SAMPLE_RATE * totalMs) / 1000);
  const samples = new Float32Array(totalSamples);

  // Click: short band-pass noise burst
  const clickFreq = 1200;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / SAMPLE_RATE;
    const envelope = Math.exp(-t * 80);
    // Mix of noise and pitched component for wooden quality
    const noise = (Math.random() * 2 - 1);
    const tone = Math.sin(2 * Math.PI * clickFreq * t);
    samples[i] = 0.6 * (0.7 * noise + 0.3 * tone) * envelope;
  }

  return samples;
}

// ── Main ───────────────────────────────────────────────────────────────────────

function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const ffmpegAvailable = (() => {
    try {
      execSync('ffmpeg -version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();

  const sounds = [
    { name: 'phase-complete', generate: generatePhaseComplete },
    { name: 'skip-played', generate: generateSkipPlayed },
    { name: 'peg-move', generate: generatePegMove },
  ];

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-sounds-'));

  let successCount = 0;
  let failCount = 0;

  for (const sound of sounds) {
    const wavPath = path.join(tmpDir, `${sound.name}.wav`);
    const mp3Path = path.join(OUTPUT_DIR, `${sound.name}.mp3`);

    console.log(`Generating ${sound.name}...`);

    const samples = sound.generate();
    writeWav(wavPath, samples, SAMPLE_RATE);

    if (ffmpegAvailable) {
      const ok = wavToMp3(wavPath, mp3Path);
      if (ok) {
        const stat = fs.statSync(mp3Path);
        console.log(`  OK: ${mp3Path} (${stat.size} bytes)`);
        successCount++;
      } else {
        // Fallback: copy WAV as .mp3 (browsers can handle it, and Howler will load it)
        fs.copyFileSync(wavPath, mp3Path);
        const stat = fs.statSync(mp3Path);
        console.log(`  WARN: ffmpeg conversion failed; copied WAV: ${mp3Path} (${stat.size} bytes)`);
        successCount++;
      }
    } else {
      // No ffmpeg — write WAV with .mp3 extension as placeholder
      fs.copyFileSync(wavPath, mp3Path);
      const stat = fs.statSync(mp3Path);
      console.log(`  WARN: ffmpeg not found; wrote WAV as ${mp3Path} (${stat.size} bytes)`);
      console.log(`  TODO: Install ffmpeg and re-run to produce proper MP3.`);
      successCount++;
    }

    // Clean up temp WAV
    fs.unlinkSync(wavPath);
  }

  fs.rmdirSync(tmpDir, { recursive: true });

  console.log('');
  console.log(`Done: ${successCount} generated, ${failCount} failed.`);

  if (!ffmpegAvailable) {
    console.log('');
    console.log('NOTE: ffmpeg was not found. Files are WAV data with .mp3 extension.');
    console.log('Install ffmpeg and re-run this script to produce proper MP3 files.');
  }
}

main();
