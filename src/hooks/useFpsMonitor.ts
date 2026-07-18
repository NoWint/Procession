import { useEffect, useRef, useState } from "react";

export interface FpsMonitorOptions {
  /** How many frames to keep in the rolling average. */
  sampleSize?: number;
  /** FPS below this threshold is considered low. */
  lowThreshold?: number;
  /** FPS above this threshold is considered high. */
  highThreshold?: number;
  /** How many consecutive low samples before reporting low FPS. */
  lowPersistFrames?: number;
  /** How many consecutive high samples before reporting high FPS. */
  highPersistFrames?: number;
}

export interface FpsSnapshot {
  fps: number;
  isLow: boolean;
  isHigh: boolean;
}

/**
 * Tracks the current render FPS using requestAnimationFrame timing.
 * Returns the rolling average and low/high performance flags.
 */
export function useFpsMonitor(options: FpsMonitorOptions = {}): FpsSnapshot {
  const {
    sampleSize = 30,
    lowThreshold = 25,
    highThreshold = 45,
    lowPersistFrames = 30,
    highPersistFrames = 30,
  } = options;

  const [fps, setFps] = useState(60);
  const [isLow, setIsLow] = useState(false);
  const [isHigh, setIsHigh] = useState(false);

  const samplesRef = useRef<number[]>([]);
  const lowCountRef = useRef(0);
  const highCountRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const tick = (time: number) => {
      if (lastTimeRef.current !== null) {
        const delta = time - lastTimeRef.current;
        if (delta > 0) {
          const instant = 1000 / delta;
          const samples = samplesRef.current;
          samples.push(instant);
          if (samples.length > sampleSize) {
            samples.shift();
          }
          const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
          setFps(Math.round(avg));

          if (avg < lowThreshold) {
            lowCountRef.current += 1;
            highCountRef.current = 0;
          } else if (avg > highThreshold) {
            highCountRef.current += 1;
            lowCountRef.current = 0;
          } else {
            lowCountRef.current = 0;
            highCountRef.current = 0;
          }

          if (lowCountRef.current >= lowPersistFrames) {
            setIsLow(true);
          }
          if (highCountRef.current >= highPersistFrames) {
            setIsHigh(true);
          }
          // Reset flags quickly when moving back to nominal range.
          if (lowCountRef.current === 0 && isLow && avg >= lowThreshold + 3) {
            setIsLow(false);
          }
          if (highCountRef.current === 0 && isHigh && avg <= highThreshold - 3) {
            setIsHigh(false);
          }
        }
      }
      lastTimeRef.current = time;
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [sampleSize, lowThreshold, highThreshold, lowPersistFrames, highPersistFrames, isLow, isHigh]);

  return { fps, isLow, isHigh };
}
