// Pure audio math helpers: map system metrics to Web Audio parameters.
// All functions are deterministic — no side effects, no AudioContext access.

const MIN_HZ = 55;
const MAX_HZ = 440;
const MIN_CPU_VOLUME = 0.015;
const MAX_CPU_VOLUME = 0.12;
const MIN_TEMP = 30;
const MAX_TEMP = 100;
const MIN_RESONANCE = 0.5;
const MAX_RESONANCE = 3.0;
const MIN_CUTOFF = 300;
const MAX_CUTOFF = 3000;
const MAX_NETWORK_LFO_RATE = 2.0;
const MAX_NETWORK_LFO_GAIN = 0.04;
const MAX_SUB_GAIN = 0.06;
const MAX_NOISE_GAIN = 0.03;

/// Map a value from [in_min, in_max] to [out_min, out_max] with logarithmic scaling.
function logMap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  const clamped = Math.max(inMin, Math.min(inMax, value));
  const ratio = (clamped - inMin) / (inMax - inMin);
  const logOut = outMin * (outMax / outMin) ** ratio;
  return Math.max(outMin, Math.min(outMax, logOut));
}

/// Linear interpolation helper.
function lerp(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  const clamped = Math.max(inMin, Math.min(inMax, value));
  const ratio = (clamped - inMin) / (inMax - inMin);
  return outMin + ratio * (outMax - outMin);
}

/// CPU 0..100% → oscillator frequency 55..440 Hz (log scale).
/// Low CPU ≈ deep hum; high CPU ≈ rising whir — subtle, not melodic.
export function cpuToFrequency(cpu: number): number {
  return logMap(cpu, 0, 100, MIN_HZ, MAX_HZ);
}

/// CPU 0..100% → gain 0.015..0.12. Always audible but quiet.
export function cpuToVolume(cpu: number): number {
  return lerp(cpu, 0, 100, MIN_CPU_VOLUME, MAX_CPU_VOLUME);
}

/// Temperature °C → filter resonance (Q) 0.5..3.0.
/// Higher temp = sharper resonance (more "stressed" sound).
export function tempToResonance(temp: number): number {
  return lerp(temp, MIN_TEMP, MAX_TEMP, MIN_RESONANCE, MAX_RESONANCE);
}

/// Temperature °C → lowpass cutoff 300..3000 Hz.
/// Higher temp = brighter (more open filter).
export function tempToCutoff(temp: number): number {
  return lerp(temp, MIN_TEMP, MAX_TEMP, MIN_CUTOFF, MAX_CUTOFF);
}

/// Network bytes/sec → LFO rate 0.05..2.0 Hz.
/// Active network = faster pulsing rhythm.
export function networkToLfoRate(bps: number): number {
  const clamped = Math.max(0, Math.min(bps, 10_000_000));
  return lerp(clamped, 0, 10_000_000, 0.05, MAX_NETWORK_LFO_RATE);
}

/// Network bytes/sec → LFO amplitude gain 0.0..0.04.
/// Active network = louder pulsing.
export function networkToLfoGain(bps: number): number {
  const clamped = Math.max(0, Math.min(bps, 10_000_000));
  return lerp(clamped, 0, 10_000_000, 0.0, MAX_NETWORK_LFO_GAIN);
}

/// Memory used/total ratio → sub-bass gain 0.0..0.06.
/// Higher memory pressure = deeper drone.
export function memoryToSubGain(ratio: number): number {
  return lerp(ratio, 0, 1, 0.0, MAX_SUB_GAIN);
}

/// Process count → noise floor gain 0.01..0.03.
/// More processes = slightly louder ambient floor.
export function processCountToNoiseGain(count: number): number {
  return lerp(count, 0, 500, 0.01, MAX_NOISE_GAIN);
}

