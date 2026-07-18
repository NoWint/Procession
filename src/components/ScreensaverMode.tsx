import { useEffect } from "react";

interface ScreensaverModeProps {
  enabled: boolean;
  onExit: () => void;
  onUiShow?: () => void;
}

export default function ScreensaverMode({ enabled, onExit, onUiShow }: ScreensaverModeProps) {
  // Enter fullscreen when kiosk mode is activated.
  useEffect(() => {
    if (!enabled) return;
    const request = async () => {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        }
      } catch {
        // Fullscreen may be blocked or already active; ignore.
      }
    };
    request();
  }, [enabled]);

  // Exit fullscreen when kiosk mode is deactivated.
  useEffect(() => {
    if (enabled) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {
        // Ignore exit errors.
      });
    }
  }, [enabled]);

  // Listen for Escape and mouse movement; also keep state in sync if the user
  // exits fullscreen through the browser UI.
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onExit();
      }
    };

    const handleMouseMove = () => {
      onUiShow?.();
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        onExit();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [enabled, onExit, onUiShow]);

  return null;
}
