/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out forwards',
        'slide-up': 'slideUp 0.4s ease-out forwards',
        'glow-pulse': 'glow 2s infinite ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(15px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        glow: {
          '0%, 100%': { opacity: '0.6', filter: 'drop-shadow(0 0 5px rgba(99, 102, 241, 0.3))' },
          '50%': { opacity: '1', filter: 'drop-shadow(0 0 15px rgba(99, 102, 241, 0.6))' },
        },
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(31, 38, 135, 0.04)',
        'glass-hover': '0 12px 40px 0 rgba(31, 38, 135, 0.08)',
        'glow-indigo': '0 0 20px 2px rgba(99, 102, 241, 0.15)',
        'glow-emerald': '0 0 20px 2px rgba(16, 185, 129, 0.15)',
      },
    },
  },
  plugins: [],
}