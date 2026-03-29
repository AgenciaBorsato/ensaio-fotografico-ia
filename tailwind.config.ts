import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          50: '#FBF7EC',
          100: '#F5ECD3',
          200: '#E8D5A0',
          300: '#D4B96E',
          400: '#C9A84C',
          500: '#A8862E',
          600: '#866B24',
          700: '#64501B',
          800: '#423512',
          900: '#211B09',
        },
        studio: {
          bg: '#0a0a0a',
          card: '#141414',
          border: 'rgba(201,168,76,0.15)',
        },
      },
      fontFamily: {
        display: ['Cormorant Garamond', 'Georgia', 'serif'],
        sans: ['DM Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
