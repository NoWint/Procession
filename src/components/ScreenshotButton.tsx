import { useState, useCallback } from "react";
import * as gifshot from "gifshot";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../hooks/useI18n";

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

function getCanvas(): HTMLCanvasElement | null {
  return document.querySelector("canvas");
}

async function dataUrlToByteArray(dataUrl: string): Promise<number[]> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const buffer = await blob.arrayBuffer();
  return Array.from(new Uint8Array(buffer));
}

async function saveWithDialog(dataUrl: string, filename: string, filterName: string, extensions: string[]) {
  const path = await save({
    defaultPath: filename,
    filters: [{ name: filterName, extensions }],
  });

  if (!path) return;

  const data = await dataUrlToByteArray(dataUrl);
  await invoke("save_file", { path, data });
}

async function capturePng() {
  const canvas = getCanvas();
  if (!canvas) return;
  const dataUrl = canvas.toDataURL("image/png");
  const filename = `procession-${Date.now()}.png`;

  try {
    await saveWithDialog(dataUrl, filename, "PNG", ["png"]);
  } catch {
    downloadDataUrl(dataUrl, filename);
  }
}

async function captureGif(onStart: () => void, onStop: () => void) {
  const canvas = getCanvas();
  if (!canvas) return;

  onStart();

  const width = canvas.width;
  const height = canvas.height;
  const totalFrames = 30;
  const frameDelayMs = 100;
  const frames: string[] = [];

  for (let i = 0; i < totalFrames; i++) {
    frames.push(canvas.toDataURL("image/png"));
    if (i < totalFrames - 1) {
      await new Promise((resolve) => setTimeout(resolve, frameDelayMs));
    }
  }

  const maxWidth = 720;
  const gifWidth = Math.min(width, maxWidth);
  const gifHeight = Math.round(gifWidth * (height / width));

  gifshot.createGIF(
    {
      images: frames,
      gifWidth,
      gifHeight,
      interval: frameDelayMs / 1000,
      numFrames: totalFrames,
      frameDuration: 1,
      sampleInterval: 10,
    },
    async (obj: { error?: boolean; errorCode?: string; errorMsg?: string; image?: string }) => {
      onStop();
      if (obj.error || !obj.image) return;

      const filename = `procession-${Date.now()}.gif`;
      try {
        await saveWithDialog(obj.image, filename, "GIF", ["gif"]);
      } catch {
        downloadDataUrl(obj.image, filename);
      }
    },
  );
}

export default function ScreenshotButton() {
  const [recording, setRecording] = useState(false);
  const { t } = useI18n();

  const handleScreenshot = useCallback(() => {
    void capturePng();
  }, []);

  const handleGif = useCallback(() => {
    void captureGif(
      () => setRecording(true),
      () => setRecording(false),
    );
  }, []);

  return (
    <div className="screenshot-controls">
      <button className="app-theme-toggle" onClick={handleScreenshot}>
        {t("app.button.screenshot")}
      </button>
      <button className="app-theme-toggle" onClick={handleGif} disabled={recording}>
        {recording ? t("app.button.recording") : t("app.button.record_gif")}
      </button>
    </div>
  );
}
