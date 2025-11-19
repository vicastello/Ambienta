import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ambienta: {
          primary: "#009DA8",
          "primary-light": "#00B5C3",
          "primary-dark": "#006E76",
          "bg-soft": "#F5F7FA",
          "bg-soft-alt": "#ECF4F5",
        },
      },
      backdropBlur: {
        xs: "2px",
        sm: "4px",
      },
      boxShadow: {
        "glass": "0 8px 32px rgba(0, 0, 0, 0.1)",
        "glass-lg": "0 20px 50px rgba(0, 0, 0, 0.12)",
        "glass-xl": "0 25px 60px rgba(0, 0, 0, 0.15)",
      },
    },
  },
} satisfies Config;
