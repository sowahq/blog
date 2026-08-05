/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./content/**/*.md",
    "./components/**/*.{js,vue,ts}",
    "./layouts/**/*.vue",
    "./pages/**/*.vue",
    "./plugins/**/*.{js,ts}",
    "./app.vue",
    "./error.vue",
  ],
  theme: {
    extend: {
      fontFamily: {
        minecraft: ["Minecraft", "sans-serif"],
        poppins: ["Poppins", "sans-serif"],
      },
      boxShadow: {
        "pixel-art": "-3px 0 0 0, 3px 0 0 0, 0 -3px 0 0, 0 3px 0 0",
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}

