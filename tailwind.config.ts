import type { Config } from "tailwindcss";

// eAcharya design tokens: emerald brand, warm sand backgrounds, forest text, sage surfaces.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef7f2",
          100: "#d9efe5",
          200: "#b3dfca",
          300: "#80c9a9",
          400: "#3fa57d",
          500: "#12875f",
          600: "#0b6b4a",
          700: "#095a3e",
          800: "#084832",
          900: "#06382a",
        },
        forest: {
          500: "#4d6b5e",
          600: "#3a574a",
          700: "#27443a",
          800: "#163529",
          900: "#0f2a20",
          950: "#0a1f17",
        },
        sand: {
          50: "#fbf9f4",
          100: "#f5f1e6",
          200: "#ebe4d2",
          300: "#ddd3b9",
        },
        sage: {
          50: "#f2f6f3",
          100: "#e4ece6",
          200: "#cfdcd3",
          300: "#b3c7b9",
        },
        danger: { 50: "#fdf1f0", 600: "#b42318", 700: "#912018" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "1rem",
        pill: "9999px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 42, 32, 0.06), 0 4px 16px rgba(15, 42, 32, 0.06)",
        lift: "0 2px 4px rgba(15, 42, 32, 0.08), 0 12px 32px rgba(15, 42, 32, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
