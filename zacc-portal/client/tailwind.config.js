/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0A1424',
        navy: {
          DEFAULT: '#0F2A4A',
          light: '#1E4270',
          dark: '#081B31',
        },
        brass: {
          DEFAULT: '#B8862E',
          light: '#E0B563',
          dark: '#8C6620',
        },
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
        card: '0 1px 2px rgba(10,20,36,0.06), 0 1px 12px rgba(10,20,36,0.04)',
        raised: '0 4px 20px rgba(10,20,36,0.10)',
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
