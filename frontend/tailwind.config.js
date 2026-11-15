/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0b0f',
        card: '#121318',
        'accent-cyan': '#D4AF37',
        'accent-orange': '#C8793A',
        'accent-gold': '#E6C65C',
        'accent-green': '#8FBC8F',
        'accent-purple': '#9B7EBD',
        danger: '#E0715F',
        border: 'rgba(212, 175, 55, 0.22)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
