import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "dark" | "light";
interface Ctx { theme: Theme; toggle: () => void; }

const ThemeContext = createContext<Ctx>({ theme: "dark", toggle: () => {} });

// OLED-dark by default (the app's identity); light is an opt-in via the toggle.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("pb_theme") as Theme) || "dark");

  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle("dark", theme === "dark");
    el.style.colorScheme = theme;
    localStorage.setItem("pb_theme", theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#000000" : "#ffffff");
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => useContext(ThemeContext);
