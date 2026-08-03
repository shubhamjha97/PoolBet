import animate from "tailwindcss-animate";
import plugin from "tailwindcss/plugin";
import colors from "tailwindcss/colors";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "./node_modules/@tremor/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    transparent: "transparent",
    current: "currentColor",
    container: { center: true, padding: "1rem", screens: { "2xl": "820px" } },
    extend: {
      fontFamily: {
        sans: ['"Inter"', "system-ui", "-apple-system", "sans-serif"],
        mono: ['"Inter"', "ui-monospace", "monospace"],
      },
      // Skinnier overall feel — every weight utility runs lighter (Inter variable).
      fontWeight: {
        normal: "380",
        medium: "440",
        semibold: "510",
        bold: "580",
        extrabold: "660",
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
        yes: "hsl(var(--yes))",
        no: "hsl(var(--no))",
        // Tremor tokens (light) — mapped to our zinc/emerald dark aesthetic
        tremor: {
          brand: { faint: colors.emerald[100], muted: colors.emerald[200], subtle: colors.emerald[400], DEFAULT: colors.emerald[500], emphasis: colors.emerald[700], inverted: colors.white },
          background: { muted: colors.gray[50], subtle: colors.gray[100], DEFAULT: colors.white, emphasis: colors.gray[700] },
          border: { DEFAULT: colors.gray[200] },
          ring: { DEFAULT: colors.gray[200] },
          content: { subtle: colors.gray[400], DEFAULT: colors.gray[500], emphasis: colors.gray[700], strong: colors.gray[900], inverted: colors.white },
        },
        "dark-tremor": {
          brand: { faint: "#0B1229", muted: colors.emerald[950], subtle: colors.emerald[800], DEFAULT: colors.emerald[500], emphasis: colors.emerald[400], inverted: colors.black },
          background: { muted: "#131A2B", subtle: colors.zinc[800], DEFAULT: colors.zinc[900], emphasis: colors.zinc[300] },
          border: { DEFAULT: "rgba(255,255,255,0.1)" },
          ring: { DEFAULT: colors.zinc[800] },
          content: { subtle: colors.zinc[600], DEFAULT: colors.zinc[500], emphasis: colors.zinc[200], strong: colors.zinc[50], inverted: colors.zinc[950] },
        },
      },
      boxShadow: {
        "glow-yes": "0 0 24px hsl(var(--yes) / 0.30)",
        "glow-no": "0 0 24px hsl(var(--no) / 0.30)",
        glass: "0 1px 0 rgba(255,255,255,0.06) inset, 0 12px 34px rgba(0,0,0,0.5)",
        "tremor-input": "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        "tremor-card": "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
        "tremor-dropdown": "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
        "dark-tremor-input": "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        "dark-tremor-card": "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
        "dark-tremor-dropdown": "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
      },
      borderRadius: {
        lg: "var(--radius)", md: "calc(var(--radius) - 4px)", sm: "calc(var(--radius) - 8px)",
        "tremor-small": "0.375rem", "tremor-default": "0.5rem", "tremor-full": "9999px",
      },
      fontSize: {
        "tremor-label": ["0.75rem", { lineHeight: "1rem" }],
        "tremor-default": ["0.875rem", { lineHeight: "1.25rem" }],
        "tremor-title": ["1.125rem", { lineHeight: "1.75rem" }],
        "tremor-metric": ["1.875rem", { lineHeight: "2.25rem" }],
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
  safelist: [
    { pattern: /^(bg|text|border|ring|fill|stroke)-(emerald|pink|zinc|amber|gray)-(50|100|200|300|400|500|600|700|800|900|950)$/, variants: ["hover", "ui-selected"] },
    { pattern: /^(bg|ring|stroke|fill)-(emerald|pink|zinc|amber)-(400|500|600)\/\d+$/ },
  ],
  plugins: [
    animate,
    plugin(({ addUtilities }) => {
      addUtilities({
        ".pt-safe": { paddingTop: "env(safe-area-inset-top)" },
        ".pb-safe": { paddingBottom: "env(safe-area-inset-bottom)" },
        ".pl-safe": { paddingLeft: "env(safe-area-inset-left)" },
        ".pr-safe": { paddingRight: "env(safe-area-inset-right)" },
        ".px-safe": { paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" },
        ".mt-safe": { marginTop: "env(safe-area-inset-top)" },
        ".tap-target": { minHeight: "44px", minWidth: "44px" },
      });
    }),
  ],
};
