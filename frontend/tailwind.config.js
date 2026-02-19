/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0f172a",
        foreground: "#f8fafc",
        card: "#1e293b",
        border: "#334155",
        primary: "#3b82f6",
        danger: "#ef4444",
      },
    },
  },
  plugins: [],
}
