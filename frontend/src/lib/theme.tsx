import { useEffect, type ReactNode } from "react";

// The app is OLED-dark by design (Robinhood/Linear fintech aesthetic). Locked to
// dark for now — light mode was a distraction from the vision. (A proper light
// theme can be reintroduced later if wanted.)
export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const el = document.documentElement;
    el.classList.add("dark");
    el.style.colorScheme = "dark";
    localStorage.setItem("pb_theme", "dark");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#000000");
  }, []);
  return <>{children}</>;
}
