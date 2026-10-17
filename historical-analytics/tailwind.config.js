/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: '#12100F',
        charcoal: {
          950: '#0F0F0F',
          900: '#12100F',
          850: '#1A140D',
          800: '#1A1A1A',
          750: '#241A14',
          700: '#1E1E1E',
          650: '#2A2A2A',
          600: '#30302C',
          500: '#3A2B20',
          400: '#4A3B30',
        },
        amber: {
          glow: '#C2410C',
          primary: '#D97706',
          bright: '#F59E0B',
          light: '#FBBF24',
          gold: '#F6D18A',
          subtle: 'rgba(217, 119, 6, 0.1)',
          subtle2: 'rgba(217, 119, 6, 0.2)',
          border: '#3A2B20',
          panel: '#1A140D',
        },
        warm: {
          50: '#F5F0E1',
          100: '#F5E6D3',
          200: '#DEC58F',
          300: '#C9B7A8',
          400: '#B8B5AF',
          500: '#8A7A6A',
          600: '#6B4A3A',
        },
        studio: {
          bg: '#111810',
          card: '#151A14',
          header: '#0A0F0A',
          border: '#2A3324',
          accent: '#34D399',
          active: '#132A10',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      }
    },
  },
  plugins: [],
}

