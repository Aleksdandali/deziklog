/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#4b569e',
        'primary-dark': '#363f75',
        'primary-light': '#eceef5',
        surface: '#F8F9FC',
        border: '#E5E7EB',
        'text-secondary': '#6B7280',
        'text-tertiary': '#9CA3AF',
        success: '#43A047',
        error: '#E53935',
        warning: '#F9A825',
      },
    },
  },
  plugins: [],
};
