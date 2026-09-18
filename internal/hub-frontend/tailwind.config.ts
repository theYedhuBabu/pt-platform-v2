/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0d1117',
        bg2: '#10151c',
        panel: '#161b22',
        panel2: '#1b212b',
        elev: '#20262f',
        borderMain: '#2a313c',
        borderSoft: '#20262e',
        textMain: '#e8eef5',
        textDim: '#9aa6b2',
        textMute: '#6b7280', 
        accent: '#5a62ff', // The designer's primary blue/purple
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      }
    },
  },
  plugins: [],
}