/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
    "./packages/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cream: {
          50: '#FFFAF2',
          100: '#FFF6E8',
          200: '#FDEED4',
          300: '#FBE0B5',
          400: '#F8CE8E',
          500: '#F5BD67',
        },
        amber: {
          400: '#FFB844',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
        },
        surface: {
          light: '#FFFFFF',
          cream: '#FFF6E8',
          border: '#EEDDC8',
          dark: '#181512',
          darkCard: '#24201B',
          darkBorder: '#3A332B',
        }
      },
      borderRadius: {
        'xl': '16px',
        '2xl': '20px',
        '3xl': '26px',
      },
      boxShadow: {
        'warm-sm': '0 2px 8px -2px rgba(180, 100, 20, 0.06)',
        'warm': '0 8px 24px -4px rgba(180, 100, 20, 0.08), 0 2px 6px -1px rgba(0, 0, 0, 0.02)',
        'warm-lg': '0 16px 36px -6px rgba(180, 100, 20, 0.12), 0 4px 12px -2px rgba(0, 0, 0, 0.03)',
      }
    },
  },
  plugins: [],
}
