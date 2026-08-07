import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces — the arena. Deep, neutral, slightly cool.
        plane: '#0B0C10',
        surface: '#15161C',
        raised: '#1C1E26',
        overlay: '#242732',
        hairline: 'rgba(255,255,255,0.08)',
        rule: 'rgba(255,255,255,0.14)',

        // Ink
        ink: '#FFFFFF',
        'ink-2': '#C7C9D4',
        'ink-3': '#8B8F9E',

        // Validated categorical slots (dark steps, checked against #15161C).
        s1: '#3987E5',
        s2: '#D95926',
        s3: '#199E70',
        s4: '#C98500',
        s5: '#D55181',
        s6: '#008300',
        s7: '#9085E9',
        s8: '#E66767',

        // Status — fixed, never themed, always paired with an icon + label.
        good: '#0CA30C',
        warning: '#FAB219',
        serious: '#EC835A',
        critical: '#D03B3B',

        // Medals. Decorative identity for podium places, not a data scale.
        gold: '#F4B740',
        silver: '#C0C7D1',
        bronze: '#CD7F45',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        card: '16px',
        pill: '999px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -12px rgba(0,0,0,0.6)',
        lift: '0 8px 32px -8px rgba(0,0,0,0.7)',
        glow: '0 0 0 1px rgba(255,255,255,0.08), 0 8px 40px -12px rgba(57,135,229,0.4)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(244,183,64,0.5)' },
          '70%': { boxShadow: '0 0 0 12px rgba(244,183,64,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(244,183,64,0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s cubic-bezier(0.16,1,0.3,1) both',
        shimmer: 'shimmer 1.4s linear infinite',
        'pulse-ring': 'pulse-ring 2.4s ease-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
