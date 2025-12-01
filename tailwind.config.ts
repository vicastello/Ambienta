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
    },
  },
} satisfies Config;
