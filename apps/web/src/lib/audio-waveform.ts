export const WAVEFORM_BARS = 96;

export function normalizePeaks(samples: Float32Array, bars = WAVEFORM_BARS): number[] {
  if (!samples.length || bars <= 0) return [];
  const count = Math.min(bars, samples.length);
  const bucket = samples.length / count;
  const peaks = Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * bucket);
    const end = Math.max(start + 1, Math.floor((index + 1) * bucket));
    let peak = 0;
    for (let i = start; i < Math.min(end, samples.length); i += 1) {
      peak = Math.max(peak, Math.abs(samples[i]));
    }
    return peak;
  });
  const max = Math.max(...peaks, 0.0001);
  return peaks.map((peak) => Math.max(0.04, Math.min(1, peak / max)));
}

export async function decodeWaveform(file: File, bars = WAVEFORM_BARS): Promise<number[]> {
  const AudioContextCtor = window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) throw new Error("Web Audio is unavailable in this browser.");
  const context = new AudioContextCtor();
  try {
    const buffer = await file.arrayBuffer();
    const decoded = await context.decodeAudioData(buffer.slice(0));
    const mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const data = decoded.getChannelData(channel);
      for (let i = 0; i < data.length; i += 1) mono[i] += data[i] / decoded.numberOfChannels;
    }
    return normalizePeaks(mono, bars);
  } finally {
    await context.close();
  }
}
