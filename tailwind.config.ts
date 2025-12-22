import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";

export default {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: colors.teal,
        ambienta: {
          primary: "var(--color-brand-primary)",
          "primary-light": "var(--color-brand-light)",
          "primary-dark": "var(--color-brand-dark)",
          "bg-soft": "#F5F7FA",
          "bg-soft-alt": "#ECF4F5",
        },
        brand: {
          primary: "#009DA8",
          light: "#00B5C3",
          dark: "#007982",
        },
      },
      spacing: {
        'card': 'var(--spacing-card-md)',
        'panel': 'var(--spacing-panel-md)',
      },
      borderRadius: {
        'card': 'var(--radius-card)',
        'input': 'var(--radius-input)',
        'badge': 'var(--radius-badge)',
      },
      backdropBlur: {
        xs: "2px",
        sm: "4px",
        card: "100px",
        panel: "120px",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        display: ["var(--font-inter)", "sans-serif"],
      },
      transitionDuration: {
        fast: "150ms",
        base: "200ms",
        slow: "300ms",
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-in',
        'fade-out': 'fade-out 200ms ease-out',
        'slide-in-up': 'slide-in-up 300ms ease-out',
        'slide-in-down': 'slide-in-down 300ms ease-out',
        'scale-in': 'scale-in 200ms ease-out',
        'shimmer': 'shimmer 2s infinite linear',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-out': {
          from: { opacity: '1' },
          to: { opacity: '0' },
        },
        'slide-in-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-down': {
          from: { opacity: '0', transform: 'translateY(-10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
      },
    },
  },
} satisfies Config;

