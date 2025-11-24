/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",   // <-- REQUIRED for Next.js App Router
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
