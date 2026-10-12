import path from 'node:path';

/** @type {import('tailwindcss').Config} */
export default {
  content: [path.join(import.meta.dirname, 'src/**/*.{js,jsx}')],
  theme: {
    extend: {
      colors: {
        fg: 'rgb(var(--fg) / <alpha-value>)', // text/borders/fills: white in dark theme, slate in light
        pop: 'rgb(var(--pop) / <alpha-value>)', // floating surfaces (launcher, teaser)
        err: 'rgb(var(--err) / <alpha-value>)',
      },
      keyframes: {
        'pop-in': { from: { opacity: 0, transform: 'translateY(12px) scale(.97)' }, to: { opacity: 1, transform: 'none' } },
        'fade-up': { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } },
        dot: { '0%,80%,100%': { transform: 'translateY(0)', opacity: 0.5 }, '40%': { transform: 'translateY(-4px)', opacity: 1 } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-5px)' } },
        wave: { '0%,100%': { transform: 'scaleY(.3)' }, '50%': { transform: 'scaleY(1)' } },
        breathe: { '0%,100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.05)' } },
        burst: { '0%': { transform: 'scale(.92)', opacity: 0.55 }, '100%': { transform: 'scale(1.35)', opacity: 0 } },
        twinkle: { '0%,100%': { opacity: 0.35 }, '50%': { opacity: 1 } },
        speak: { '0%,100%': { transform: 'scale(1)' }, '25%': { transform: 'scale(1.05)' }, '55%': { transform: 'scale(.98)' }, '80%': { transform: 'scale(1.07)' } },
        tease: { from: { opacity: 0, transform: 'translateY(10px) scale(.94)' }, to: { opacity: 1, transform: 'none' } },
        drift: { '0%,100%': { transform: 'translate(0,0)' }, '50%': { transform: 'translate(-18px,14px)' } },
        ring: { '0%': { boxShadow: '0 0 0 0 rgb(59 130 246 / .55)' }, '100%': { boxShadow: '0 0 0 14px rgb(59 130 246 / 0)' } },
      },
      animation: {
        'pop-in': 'pop-in .25s ease-out',
        'fade-up': 'fade-up .25s ease-out both',
        dot: 'dot 1.2s infinite ease-in-out',
        float: 'float 3.5s infinite ease-in-out',
        tease: { from: { opacity: 0, transform: 'translateY(10px) scale(.94)' }, to: { opacity: 1, transform: 'none' } },
        drift: { '0%,100%': { transform: 'translate(0,0)' }, '50%': { transform: 'translate(-18px,14px)' } },
        ring: 'ring 2.2s infinite',
        wave: 'wave 1s infinite ease-in-out',
        breathe: 'breathe 3s infinite ease-in-out',
        burst: 'burst .8s ease-out forwards',
        twinkle: 'twinkle 3s infinite ease-in-out',
        speak: 'speak 1.1s infinite ease-in-out',
        tease: 'tease .4s cubic-bezier(.34,1.4,.64,1) both',
        drift: 'drift 9s infinite ease-in-out',
      },
    },
  },
};
