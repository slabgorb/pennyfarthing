/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/public/**/*.{tsx,ts,jsx,js,html}',
  ],
  theme: {
    extend: {
      // Extend with Cyclist's existing CSS variable colors
      colors: {
        primary: 'var(--bg-primary)',
        secondary: 'var(--bg-secondary)',
        tertiary: 'var(--bg-tertiary)',
        accent: 'var(--accent)',
        'accent-secondary': 'var(--accent-secondary)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        border: 'var(--border-color)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        error: 'var(--error)',
      },
      fontFamily: {
        sans: ['var(--font-ui)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-code)', 'monospace'],
      },
    },
  },
  plugins: [],
};
