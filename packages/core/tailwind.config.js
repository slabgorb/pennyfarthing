/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/public/**/*.{tsx,ts,jsx,js,html}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--bg-primary)',
          foreground: 'var(--text-primary)',
        },
        secondary: {
          DEFAULT: 'var(--bg-secondary)',
          foreground: 'var(--text-primary)',
        },
        tertiary: 'var(--bg-tertiary)',
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--text-primary)',
          secondary: 'var(--accent-secondary)',
        },
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        border: 'var(--border)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        error: 'var(--error)',
        background: 'var(--bg-primary)',
        foreground: 'var(--text-primary)',
        card: {
          DEFAULT: 'var(--bg-secondary)',
          foreground: 'var(--text-primary)',
        },
        popover: {
          DEFAULT: 'var(--bg-secondary)',
          foreground: 'var(--text-primary)',
        },
        muted: {
          DEFAULT: 'var(--bg-tertiary)',
          foreground: 'var(--text-muted)',
        },
        destructive: {
          DEFAULT: 'var(--status-error)',
          foreground: '#fafafa',
        },
        input: 'var(--border)',
        ring: 'var(--accent)',
      },
      fontFamily: {
        sans: ['var(--font-ui)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-code)', 'monospace'],
      },
      borderRadius: {
        lg: '0.5rem',
        md: 'calc(0.5rem - 2px)',
        sm: 'calc(0.5rem - 4px)',
      },
    },
  },
  plugins: [],
};
