import { getThemeRegistry, type ThemeMeta } from "../utils/theme";

interface ThemeSelectorProps {
  currentUrl: string;
  onChange: (url: string) => void;
}

export default function ThemeSelector({ currentUrl, onChange }: ThemeSelectorProps) {
  const themes = getThemeRegistry();

  return (
    <select
      className="theme-selector"
      value={currentUrl}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Select theme"
    >
      {themes.map((theme: ThemeMeta) => (
        <option key={theme.id} value={theme.url}>
          {theme.name}
        </option>
      ))}
    </select>
  );
}
