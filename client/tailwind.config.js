/** @type {import('tailwindcss').Config} */
// Colour palette drawn directly from the real ZACC seal (black ring, gold
// Zimbabwe Bird / lettering / chevron pattern, red star, mottled grey-stone
// backdrop) — see README.md §12. Everything in the app consumes these
// tokens, so a further correction is a config-file change, not a rebuild.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#141310',
        charcoal: {
          DEFAULT: '#161512',
          light: '#3A3833',
          dark: '#0A0908',
        },
        gold: {
          DEFAULT: '#D9A62E',
          light: '#EAC569',
          dark: '#A87D1E',
        },
        emblem: '#CE1126',
        parchment: '#F7F4EC',
        paper: '#FFFFFF',
        slate: {
          DEFAULT: '#5B6472',
          light: '#88909A',
        },
        line: '#E4E0D3',
        status: {
          red: '#B3402F',
          'red-bg': '#FBEAE7',
          amber: '#C2680B',
          'amber-bg': '#FCF0DF',
          green: '#2F7A4D',
          'green-bg': '#E7F3EC',
          critical: '#7A2020',
        },
      },
      fontFamily: {
        display: ['"Fraunces"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(20,19,16,0.06), 0 1px 12px rgba(20,19,16,0.04)',
        raised: '0 4px 20px rgba(20,19,16,0.10)',
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '8px',
        lg: '12px',
        xl: '18px',
      },
    },
  },
  plugins: [],
};
