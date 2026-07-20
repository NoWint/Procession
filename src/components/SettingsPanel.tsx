import ThemeSelector from "./ThemeSelector";
import { useI18n } from "../hooks/useI18n";
import type { Locale } from "../i18n";
import "./SettingsPanel.css";

/**
 * Quality mode for the renderer.
 * - "auto": delegate to useFpsMonitor (adaptive high/med/low).
 * - "performance": force bloom off and reduce building count to 60% of cap.
 * - "quality": force bloom on and use the full process cap.
 *
 * The actual override math lives in App.tsx; this component is purely
 * presentational and reports the user's selection upward.
 */
export type QualityMode = "auto" | "performance" | "quality";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  processCap: number;
  onProcessCapChange: (value: number) => void;
  qualityMode: QualityMode;
  onQualityModeChange: (mode: QualityMode) => void;
  currentThemeUrl: string;
  onThemeChange: (url: string) => void;
  // 主题入口收敛（P0-1）：把 ThemeEditor 入口挪进 SettingsPanel
  onOpenThemeEditor: () => void;
  // 顶部按钮收敛（P1-3）：环绕 / 时光棱镜 toggle 挪进 SettingsPanel
  autoRotate: boolean;
  onAutoRotateChange: (value: boolean) => void;
  timelineOpen: boolean;
  onTimelineOpenChange: (value: boolean) => void;
}

const PROCESS_CAP_MIN = 100;
const PROCESS_CAP_MAX = 2000;
const PROCESS_CAP_STEP = 50;

const QUALITY_MODE_KEYS = {
  auto: "settings.quality.auto",
  performance: "settings.quality.performance",
  quality: "settings.quality.quality",
} as const;

const QUALITY_MODE_ORDER: QualityMode[] = ["auto", "performance", "quality"];

const LOCALE_OPTIONS: Locale[] = ["zh", "en"];

/**
 * Right-side settings drawer. Reuses the existing ThemeSelector for theme
 * switching and exposes new Performance controls (process cap + quality mode),
 * plus a Language section for switching the interface locale at runtime.
 *
 * The Refresh Rate section is informational: the backend pushes at 1Hz
 * (spec-fixed, see SPEC.md §5) and `useSystemData` listens on a Tauri event,
 * so there is no client-side interval to tune.
 *
 * Escape handling is delegated to App.tsx so it can coordinate with the
 * existing popup/utility-mode Escape bindings (close settings first, then
 * popup on the next press).
 */
export default function SettingsPanel({
  open,
  onClose,
  processCap,
  onProcessCapChange,
  qualityMode,
  onQualityModeChange,
  currentThemeUrl,
  onThemeChange,
  onOpenThemeEditor,
  autoRotate,
  onAutoRotateChange,
  timelineOpen,
  onTimelineOpenChange,
}: SettingsPanelProps) {
  const { t, locale, setLocale } = useI18n();

  if (!open) return null;

  return (
    <aside
      className="settings-panel"
      role="dialog"
      aria-label={t("settings.aria_label")}
      aria-modal="false"
    >
      <header className="settings-panel-header">
        <h2>{t("settings.header")}</h2>
        <button
          className="settings-panel-close"
          onClick={onClose}
          aria-label={t("settings.close")}
          type="button"
        >
          ×
        </button>
      </header>

      <div className="settings-panel-body">
        <section className="settings-section">
          <h3>{t("settings.section.appearance")}</h3>
          <p className="settings-hint">{t("settings.appearance.hint")}</p>
          <label className="settings-field">
            <span className="settings-field-label">{t("settings.appearance.theme")}</span>
            <ThemeSelector currentUrl={currentThemeUrl} onChange={onThemeChange} />
          </label>
          {/* 主题入口收敛（P0-1）：原顶部"编辑信号"按钮挪入此处 */}
          <button
            type="button"
            className="settings-edit-signal"
            onClick={onOpenThemeEditor}
          >
            {t("settings.appearance.edit_signal")}
          </button>
        </section>

        {/* P1-3 顶部按钮收敛：原顶部的"环绕"和"时光棱镜"按钮挪入此 section */}
        <section className="settings-section">
          <h3>{t("settings.section.view")}</h3>
          <p className="settings-hint">{t("settings.view.hint")}</p>

          <label className="settings-toggle-row">
            <span className="settings-toggle-label">{t("settings.view.orbit")}</span>
            <input
              type="checkbox"
              checked={autoRotate}
              onChange={(e) => onAutoRotateChange(e.target.checked)}
              aria-label={t("settings.view.orbit")}
            />
            <span className="settings-toggle-switch" aria-hidden="true" />
          </label>
          <p className="settings-hint settings-hint-inline">{t("settings.view.orbit_hint")}</p>

          <label className="settings-toggle-row">
            <span className="settings-toggle-label">{t("settings.view.time_lens")}</span>
            <input
              type="checkbox"
              checked={timelineOpen}
              onChange={(e) => onTimelineOpenChange(e.target.checked)}
              aria-label={t("settings.view.time_lens")}
            />
            <span className="settings-toggle-switch" aria-hidden="true" />
          </label>
          <p className="settings-hint settings-hint-inline">{t("settings.view.time_lens_hint")}</p>
        </section>

        <section className="settings-section">
          <h3>{t("settings.section.performance")}</h3>

          <label className="settings-field">
            <span className="settings-field-label">{t("settings.process_cap.label")}</span>
            <span className="settings-field-value">{processCap}</span>
          </label>
          <input
            type="range"
            min={PROCESS_CAP_MIN}
            max={PROCESS_CAP_MAX}
            step={PROCESS_CAP_STEP}
            value={processCap}
            onChange={(e) => onProcessCapChange(Number(e.target.value))}
            className="settings-slider"
            aria-label={t("settings.process_cap.aria")}
          />
          <div className="settings-slider-range">
            <span>{PROCESS_CAP_MIN}</span>
            <span>{PROCESS_CAP_MAX}</span>
          </div>
          <p className="settings-hint">{t("settings.process_cap.description")}</p>

          <div className="settings-field settings-field-column">
            <span className="settings-field-label">{t("settings.quality.label")}</span>
            <div
              className="settings-toggle-group"
              role="radiogroup"
              aria-label={t("settings.quality.aria")}
            >
              {QUALITY_MODE_ORDER.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={qualityMode === mode}
                  className={`settings-toggle-option${
                    qualityMode === mode ? " active" : ""
                  }`}
                  onClick={() => onQualityModeChange(mode)}
                >
                  {t(QUALITY_MODE_KEYS[mode])}
                </button>
              ))}
            </div>
            <p className="settings-hint">{t("settings.quality.description")}</p>
          </div>
        </section>

        <section className="settings-section">
          <h3>{t("settings.section.refresh_rate")}</h3>
          <p className="settings-hint">{t("settings.refresh_rate.description")}</p>
        </section>

        <section className="settings-section">
          <h3>{t("settings.section.language")}</h3>
          <p className="settings-hint">{t("settings.language.description")}</p>
          <div
            className="settings-toggle-group"
            role="radiogroup"
            aria-label={t("settings.section.language")}
          >
            {LOCALE_OPTIONS.map((loc) => (
              <button
                key={loc}
                type="button"
                role="radio"
                aria-checked={locale === loc}
                className={`settings-toggle-option${
                  locale === loc ? " active" : ""
                }`}
                onClick={() => setLocale(loc)}
              >
                {t(`settings.language.${loc}`)}
              </button>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
