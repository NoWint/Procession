import { useState, useCallback, useEffect } from "react";
import type { Theme, ThemeColors, ThemeScene, ThemeTypography } from "../utils/theme";
import "./ThemeEditor.css";
import { exportThemeJson, importThemeJson, FALLBACK_THEME } from "../utils/theme";
import { useI18n } from "../hooks/useI18n";

interface ThemeEditorProps {
  theme: Theme;
  onChange: (theme: Theme) => void;
  onSave: (theme: Theme) => void;
  onClose: () => void;
}

const COLOR_KEYS: (keyof ThemeColors)[] = [
  "background",
  "surface",
  "surfaceElevated",
  "text",
  "textMuted",
  "accent",
  "border",
  "grid",
  "gridSecondary",
  "ground",
  "system",
  "user",
  "active",
  "idle",
  "sleeping",
  "stopped",
  "zombie",
  "particle",
];

export default function ThemeEditor({ theme, onChange, onSave, onClose }: ThemeEditorProps) {
  const [draft, setDraft] = useState<Theme>(theme);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const updateColor = useCallback(
    (key: keyof ThemeColors, value: string) => {
      setDraft((prev) => {
        const next = { ...prev, colors: { ...prev.colors, [key]: value } };
        onChange(next);
        return next;
      });
    },
    [onChange],
  );

  const updateScene = useCallback(
    (key: keyof ThemeScene, value: string | number) => {
      setDraft((prev) => {
        const nextScene = { ...prev.scene, [key]: value };
        const next = { ...prev, scene: nextScene };
        onChange(next);
        return next;
      });
    },
    [onChange],
  );

  const updateTypography = useCallback(
    (key: keyof ThemeTypography, value: string) => {
      setDraft((prev) => {
        const next = { ...prev, typography: { ...prev.typography, [key]: value } };
        onChange(next);
        return next;
      });
    },
    [onChange],
  );

  const updateName = useCallback(
    (value: string) => {
      setDraft((prev) => {
        const next = { ...prev, name: value };
        onChange(next);
        return next;
      });
    },
    [onChange],
  );

  const updateMode = useCallback(
    (value: "dark" | "light") => {
      setDraft((prev) => {
        const next = { ...prev, mode: value };
        onChange(next);
        return next;
      });
    },
    [onChange],
  );

  const handleImport = useCallback(() => {
    const imported = importThemeJson(importText);
    if (imported) {
      setDraft(imported);
      setImportError(null);
      onChange(imported);
    } else {
      setImportError(t("theme_editor.invalid_json"));
    }
  }, [importText, onChange, t]);

  const handleExport = useCallback(() => {
    const blob = new Blob([exportThemeJson(draft)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${draft.name.replace(/\s+/g, "_").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [draft]);

  const handleReset = useCallback(() => {
    setDraft(FALLBACK_THEME);
    onChange(FALLBACK_THEME);
  }, [onChange]);

  const handleSave = useCallback(() => {
    onSave(draft);
  }, [draft, onSave]);

  return (
    <div className="theme-editor-overlay" onClick={onClose}>
      <div className="theme-editor-panel" onClick={(e) => e.stopPropagation()}>
        <div className="theme-editor-header">
          <h2>{t("theme_editor.title")}</h2>
          <button className="theme-editor-close" onClick={onClose} aria-label={t("theme_editor.close_aria")}>
            ×
          </button>
        </div>

        <div className="theme-editor-body">
          <section className="theme-editor-section">
            <h3>{t("theme_editor.identity")}</h3>
            <label className="theme-editor-field">
              <span>{t("theme_editor.name")}</span>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => updateName(e.target.value)}
              />
            </label>
            <label className="theme-editor-field">
              <span>{t("theme_editor.mode")}</span>
              <select
                value={draft.mode}
                onChange={(e) => updateMode(e.target.value as "dark" | "light")}
              >
                <option value="dark">{t("theme_editor.mode.dark")}</option>
                <option value="light">{t("theme_editor.mode.light")}</option>
              </select>
            </label>
          </section>

          <section className="theme-editor-section">
            <h3>{t("theme_editor.colors")}</h3>
            <div className="theme-editor-grid">
              {COLOR_KEYS.map((key) => (
                <label key={key} className="theme-editor-color-field">
                  <span>{key}</span>
                  <input
                    type="color"
                    value={draft.colors[key]}
                    onChange={(e) => updateColor(key, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="theme-editor-section">
            <h3>{t("theme_editor.typography")}</h3>
            <label className="theme-editor-field">
              <span>{t("theme_editor.heading")}</span>
              <input
                type="text"
                value={draft.typography.heading}
                onChange={(e) => updateTypography("heading", e.target.value)}
              />
            </label>
            <label className="theme-editor-field">
              <span>{t("theme_editor.body")}</span>
              <input
                type="text"
                value={draft.typography.body}
                onChange={(e) => updateTypography("body", e.target.value)}
              />
            </label>
            <label className="theme-editor-field">
              <span>{t("theme_editor.mono")}</span>
              <input
                type="text"
                value={draft.typography.mono}
                onChange={(e) => updateTypography("mono", e.target.value)}
              />
            </label>
          </section>

          <section className="theme-editor-section">
            <h3>{t("theme_editor.scene")}</h3>
            <label className="theme-editor-field">
              <span>{t("theme_editor.ambient_intensity")}</span>
              <input
                type="number"
                step={0.1}
                min={0}
                max={2}
                value={draft.scene.ambientIntensity}
                onChange={(e) => updateScene("ambientIntensity", parseFloat(e.target.value) || 0)}
              />
            </label>
            <label className="theme-editor-field">
              <span>{t("theme_editor.directional_intensity")}</span>
              <input
                type="number"
                step={0.1}
                min={0}
                max={2}
                value={draft.scene.directionalIntensity}
                onChange={(e) =>
                  updateScene("directionalIntensity", parseFloat(e.target.value) || 0)
                }
              />
            </label>
            <label className="theme-editor-field">
              <span>{t("theme_editor.fog_color")}</span>
              <input
                type="color"
                value={draft.scene.fogColor}
                onChange={(e) => updateScene("fogColor", e.target.value)}
              />
            </label>
            <label className="theme-editor-field">
              <span>{t("theme_editor.fog_near")}</span>
              <input
                type="number"
                step={1}
                min={0}
                value={draft.scene.fogNear}
                onChange={(e) => updateScene("fogNear", parseFloat(e.target.value) || 0)}
              />
            </label>
            <label className="theme-editor-field">
              <span>{t("theme_editor.fog_far")}</span>
              <input
                type="number"
                step={1}
                min={0}
                value={draft.scene.fogFar}
                onChange={(e) => updateScene("fogFar", parseFloat(e.target.value) || 0)}
              />
            </label>
          </section>

          <section className="theme-editor-section">
            <h3>{t("theme_editor.import_export")}</h3>
            <div className="theme-editor-actions">
              <button onClick={handleExport}>{t("theme_editor.export_json")}</button>
              <button onClick={handleReset}>{t("theme_editor.reset")}</button>
            </div>
            <textarea
              className="theme-editor-import"
              rows={4}
              placeholder={t("theme_editor.import_placeholder")}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            {importError && <div className="theme-editor-error">{importError}</div>}
            <button onClick={handleImport}>{t("theme_editor.import_json")}</button>
          </section>
        </div>

        <div className="theme-editor-footer">
          <button className="theme-editor-save" onClick={handleSave}>
            {t("theme_editor.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
