import animate from "tailwindcss-animate";
import plugin from "tailwindcss/plugin";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "820px" } },
    extend: {
      fontFamily: {
        sans: ['"Space Grotesk"', "system-ui", "-apple-system", "sans-serif"],
        mono: ['"SF Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        // brand semantic tokens
        yes: "hsl(var(--yes))",
        no: "hsl(var(--no))",
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 4px)", sm: "calc(var(--radius) - 8px)" },
      boxShadow: {
        "glow-yes": "0 0 24px hsl(var(--yes) / 0.30)",
        "glow-no": "0 0 24px hsl(var(--no) / 0.30)",
        glass: "0 1px 0 rgba(255,255,255,0.06) inset, 0 12px 34px rgba(0,0,0,0.5)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        "fade-up": { from: { opacity: "0", transform: "translateY(10px) scale(.985)" }, to: { opacity: "1", transform: "none" } },
        "pop-in": { "0%": { opacity: "0", transform: "scale(.92) translateY(8px)" }, "100%": { opacity: "1", transform: "none" } },
        "grid-pan": { from: { backgroundPosition: "0 0" }, to: { backgroundPosition: "54px 54px" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.28s cubic-bezier(0.34,1.55,0.5,1)",
        "accordion-up": "accordion-up 0.24s ease",
        "fade-up": "fade-up 0.26s cubic-bezier(0.34,1.55,0.5,1) both",
        "pop-in": "pop-in 0.3s cubic-bezier(0.34,1.55,0.5,1) both",
        "grid-pan": "grid-pan 42s linear infinite",
      },
    },
  },
  plugins: [
    animate,
    // mobile-first primitives: safe-area insets + 44px tap targets
    plugin(({ addUtilities }) => {
      addUtilities({
        ".pt-safe": { paddingTop: "env(safe-area-inset-top)" },
        ".pb-safe": { paddingBottom: "env(safe-area-inset-bottom)" },
        ".pl-safe": { paddingLeft: "env(safe-area-inset-left)" },
        ".pr-safe": { paddingRight: "env(safe-area-inset-right)" },
        ".px-safe": { paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" },
        ".mt-safe": { marginTop: "env(safe-area-inset-top)" },
        ".min-h-dvh-safe": { minHeight: "100dvh" },
        ".tap-target": { minHeight: "44px", minWidth: "44px" },
      });
    }),
  ],
};
