import { getThemeRegistry, type ThemeMeta } from "../utils/theme";
import { useI18n } from "../hooks/useI18n";

interface ThemeSelectorProps {
  currentUrl: string;
  onChange: (url: string) => void;
}

export default function ThemeSelector({ currentUrl, onChange }: ThemeSelectorProps) {
  const themes = getThemeRegistry();
  const { t } = useI18n();

  return (
    <select
      className="theme-selector"
      value={currentUrl}
      onChange={(e) => onChange(e.target.value)}
      aria-label={t("settings.appearance.theme_aria")}
    >
      {themes.map((theme: ThemeMeta) => (
        <option key={theme.id} value={theme.url}>
          {theme.name}
        </option>
      ))}
    </select>
  );
}
