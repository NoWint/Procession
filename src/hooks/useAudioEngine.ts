import { useEffect, useRef, useCallback, useState } from "react";
import type { SystemSnapshot } from "../utils/types";
import {
  cpuToFrequency,
  cpuToVolume,
  tempToCutoff,
  tempToResonance,
  networkToLfoRate,
  networkToLfoGain,
  memoryToSubGain,
} from "../utils/audio";

interface AudioEngineOptions {
  snapshot: SystemSnapshot | null;
}

interface AudioEngineState {
  isMuted: boolean;
  isSupported: boolean;
  toggleMute: () => void;
}

/// Lazy-initialized Web Audio engine that sonifies system metrics.
/// Creates AudioContext on first user interaction (autoplay policy).
/// Maps CPU/temp/network/memory to oscillator parameters at 1Hz cadence.
export function useAudioEngine({ snapshot }: AudioEngineOptions): AudioEngineState {
  // 默认静音：避免低频嗡嗡声造成耳鸣不适。用户可按 M 或点击按钮解除静音。
  const [isMuted, setIsMuted] = useState(true);
  const [isSupported, setIsSupported] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // Audio nodes — created once, parameters updated on each snapshot.
  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const cpuOscRef = useRef<OscillatorNode | null>(null);
  const cpuGainRef = useRef<GainNode | null>(null);
  const cpuFilterRef = useRef<BiquadFilterNode | null>(null);
  const memOscRef = useRef<OscillatorNode | null>(null);
  const memGainRef = useRef<GainNode | null>(null);
  const netCarrierRef = useRef<OscillatorNode | null>(null);
  const netGainRef = useRef<GainNode | null>(null);
  const netLfoRef = useRef<OscillatorNode | null>(null);
  const lfoGainRef = useRef<GainNode | null>(null);

  // mutedRef 初始为 true，与 isMuted 默认值同步
  const mutedRef = useRef(true);

  const toggleMute = useCallback(() => {
    mutedRef.current = !mutedRef.current;
    setIsMuted(mutedRef.current);
    if (masterGainRef.current && ctxRef.current) {
      const now = ctxRef.current.currentTime;
      // Use ramp to avoid audible click on direct gain.value assignment
      masterGainRef.current.gain.cancelScheduledValues(now);
      masterGainRef.current.gain.setValueAtTime(
        masterGainRef.current.gain.value,
        now,
      );
      masterGainRef.current.gain.linearRampToValueAtTime(
        mutedRef.current ? 0 : 1,
        now + 0.04,
      );
    }
  }, []);

  // Lazy init: set up a one-shot interaction listener.
  useEffect(() => {
    if (!window.AudioContext && !(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) {
      setIsSupported(false);
      return;
    }

    const tryInit = () => {
      if (ctxRef.current) return;

      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      ctxRef.current = ctx;

      const master = ctx.createGain();
      // 默认静音（isMuted 初始 true），仅在用户解除静音时才提升 master gain
      master.gain.value = 0;
      master.connect(ctx.destination);
      masterGainRef.current = master;

      // CPU drone: sine oscillator → gain → filter → master
      const cpuOsc = ctx.createOscillator();
      cpuOsc.type = "sine";
      cpuOsc.frequency.value = 110;
      cpuOsc.start();

      const cpuGain = ctx.createGain();
      cpuGain.gain.value = 0.02;
      cpuOsc.connect(cpuGain);

      const cpuFilter = ctx.createBiquadFilter();
      cpuFilter.type = "lowpass";
      cpuFilter.frequency.value = 500;
      cpuFilter.Q.value = 1;
      cpuGain.connect(cpuFilter);
      cpuFilter.connect(master);

      cpuOscRef.current = cpuOsc;
      cpuGainRef.current = cpuGain;
      cpuFilterRef.current = cpuFilter;

      // Memory sub-bass: fixed 40 Hz sine → gain → master
      const memOsc = ctx.createOscillator();
      memOsc.type = "sine";
      memOsc.frequency.value = 40;
      memOsc.start();

      const memGain = ctx.createGain();
      memGain.gain.value = 0;
      memOsc.connect(memGain);
      memGain.connect(master);

      memOscRef.current = memOsc;
      memGainRef.current = memGain;

      // Network rhythm: 220 Hz carrier → gain → master,
      // amplitude-modulated by a LFO oscillator → lfoGain (controls carrier gain)
      const netCarrier = ctx.createOscillator();
      netCarrier.type = "sine";
      netCarrier.frequency.value = 220;
      netCarrier.start();

      const netGain = ctx.createGain();
      netGain.gain.value = 0;
      netCarrier.connect(netGain);
      netGain.connect(master);

      // LFO oscillator whose output controls netGain via a gain node.
      const netLfo = ctx.createOscillator();
      netLfo.type = "triangle";
      netLfo.frequency.value = 0.1;
      netLfo.start();

      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0;
      netLfo.connect(lfoGain);
      // Connect LFO → netGain.gain (modulate the carrier's amplitude)
      lfoGain.connect(netGain.gain);

      netCarrierRef.current = netCarrier;
      netGainRef.current = netGain;
      netLfoRef.current = netLfo;
      lfoGainRef.current = lfoGain;

      setInitialized(true);
    };

    // Init on first keydown or mousedown.
    const handler = () => {
      tryInit();
      window.removeEventListener("keydown", handler);
      window.removeEventListener("mousedown", handler);
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("mousedown", handler);

    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("mousedown", handler);
      // Cleanup: close AudioContext on unmount
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {});
        ctxRef.current = null;
      }
    };
  }, []);

  // Update audio parameters when snapshot changes (1Hz cadence).
  useEffect(() => {
    if (!snapshot || !initialized) return;

    const cpu = snapshot.cpu.total;
    const temp = snapshot.temperature?.cpu ?? 50;
    const netBps = snapshot.network.down_bytes_per_sec + snapshot.network.up_bytes_per_sec;
    const memRatio = snapshot.memory.total_mb > 0
      ? snapshot.memory.used_mb / snapshot.memory.total_mb
      : 0;
    const stale = snapshot.stale;

    // CPU oscillator: frequency + volume
    if (cpuOscRef.current && cpuGainRef.current) {
      const freq = stale ? 55 : cpuToFrequency(cpu);
      const vol = stale ? 0.01 : cpuToVolume(cpu);
      cpuOscRef.current.frequency.setTargetAtTime(freq, ctxRef.current!.currentTime, 0.3);
      cpuGainRef.current.gain.setTargetAtTime(vol, ctxRef.current!.currentTime, 0.3);
    }

    // CPU filter: temperature maps to cutoff + resonance
    if (cpuFilterRef.current) {
      const cutoff = stale ? 200 : tempToCutoff(temp);
      const q = stale ? 0.5 : tempToResonance(temp);
      cpuFilterRef.current.frequency.setTargetAtTime(cutoff, ctxRef.current!.currentTime, 0.3);
      cpuFilterRef.current.Q.setTargetAtTime(q, ctxRef.current!.currentTime, 0.3);
    }

    // Memory sub-bass
    if (memGainRef.current) {
      const subGain = stale ? 0 : memoryToSubGain(memRatio);
      memGainRef.current.gain.setTargetAtTime(subGain, ctxRef.current!.currentTime, 0.5);
    }

    // Network rhythm LFO
    if (netLfoRef.current && netGainRef.current && lfoGainRef.current) {
      const lfoRate = stale ? 0.05 : networkToLfoRate(netBps);
      const lfoMod = stale ? 0 : networkToLfoGain(netBps);
      netLfoRef.current.frequency.setTargetAtTime(lfoRate, ctxRef.current!.currentTime, 0.5);

      // The LFO output goes through lfoGain before reaching netGain.gain.
      // lfoMod controls the amplitude of the LFO modulation (i.e., how much
      // the carrier gain oscillates). At 0, no pulsing.
      lfoGainRef.current.gain.setTargetAtTime(lfoMod, ctxRef.current!.currentTime, 0.5);
      // The carrier gain baseline (without LFO) stays at ~half of max
      netGainRef.current.gain.setTargetAtTime(0.02, ctxRef.current!.currentTime, 0.3);
    }
  }, [snapshot, initialized]);

  return { isMuted, isSupported, toggleMute };
}
