import { MoonIcon, SunIcon } from "./icons";

/** Light/dark switch. Shows the theme it switches to. */
export default function ThemeToggle({ theme, onToggle, className = "st-round", size }) {
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className={className}
      onClick={onToggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      {theme === "dark" ? <SunIcon size={size} /> : <MoonIcon size={size} />}
    </button>
  );
}
