/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('../ui/tailwind.config.js')],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: '',
  theme: {
    fontFamily: {
      inter: [
        'Inter Variable',
        'Inter',
        '-apple-system',
        'BlinkMacSystemFont',
        'Segoe UI',
        'Roboto',
        'Helvetica Neue',
        'Arial',
        'sans-serif',
      ],
      mono: [
        'JetBrains Mono',
        'Fira Code',
        'SF Mono',
        'Monaco',
        'Cascadia Code',
        'Consolas',
        'monospace',
      ],
    },
    fontSize: {
      xxs: ['0.625rem', { lineHeight: '0.875rem', letterSpacing: '0.01em' }], // 10px
      xs: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.01em' }], // 11px
      sm: ['0.75rem', { lineHeight: '1.125rem', letterSpacing: '0em' }], // 12px
      base: ['0.8125rem', { lineHeight: '1.25rem', letterSpacing: '0em' }], // 13px
      lg: ['0.875rem', { lineHeight: '1.375rem', letterSpacing: '0em' }], // 14px
      xl: ['1rem', { lineHeight: '1.5rem', letterSpacing: '-0.01em' }], // 16px
      '2xl': ['1.125rem', { lineHeight: '1.75rem', letterSpacing: '-0.01em' }], // 18px
      '3xl': ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.02em' }], // 24px
      '4xl': ['2rem', { lineHeight: '2.5rem', letterSpacing: '-0.02em' }], // 32px
      '5xl': ['2.5rem', { lineHeight: '3rem', letterSpacing: '-0.02em' }], // 40px
      '6xl': ['3rem', { lineHeight: '3.5rem', letterSpacing: '-0.03em' }], // 48px
    },
    fontWeight: {
      hairline: '100',
      thin: '200',
      light: '300',
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
      extrabold: '800',
      black: '900',
    },
    extend: {
      colors: {
        // Core brand colors
        highlight: 'hsl(var(--highlight))',
        neutral: 'hsl(var(--neutral))',
        'neutral-light': 'hsl(var(--neutral-light))',
        'neutral-dark': 'hsl(var(--neutral-dark))',

        // Extended background system
        background: {
          DEFAULT: 'hsl(var(--background))',
          elevated: 'hsl(var(--background-elevated))',
          panel: 'hsl(var(--background-panel))',
        },

        // Extended foreground system
        foreground: {
          DEFAULT: 'hsl(var(--foreground))',
          secondary: 'hsl(var(--foreground-secondary))',
          muted: 'hsl(var(--foreground-muted))',
        },

        // Border system
        border: {
          DEFAULT: 'hsl(var(--border))',
          strong: 'hsl(var(--border-strong))',
          subtle: 'hsl(var(--border-subtle))',
        },

        // Input system
        input: {
          DEFAULT: 'hsl(var(--input))',
          border: 'hsl(var(--input-border))',
          focus: 'hsl(var(--input-focus))',
        },

        // Focus ring
        ring: {
          DEFAULT: 'hsl(var(--ring))',
          offset: 'hsl(var(--ring-offset))',
        },

        // Primary action colors
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          hover: 'hsl(var(--primary-hover))',
          active: 'hsl(var(--primary-active))',
          foreground: 'hsl(var(--primary-foreground))',
        },

        // Secondary action colors
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          hover: 'hsl(var(--secondary-hover))',
          foreground: 'hsl(var(--secondary-foreground))',
        },

        // Status colors - Success
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          bg: 'hsl(var(--success-bg))',
          border: 'hsl(var(--success-border))',
          text: 'hsl(var(--success-text))',
        },

        // Status colors - Warning
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
          bg: 'hsl(var(--warning-bg))',
          border: 'hsl(var(--warning-border))',
          text: 'hsl(var(--warning-text))',
        },

        // Status colors - Error
        error: {
          DEFAULT: 'hsl(var(--error))',
          foreground: 'hsl(var(--error-foreground))',
          bg: 'hsl(var(--error-bg))',
          border: 'hsl(var(--error-border))',
          text: 'hsl(var(--error-text))',
        },

        // Status colors - Info
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
          bg: 'hsl(var(--info-bg))',
          border: 'hsl(var(--info-border))',
          text: 'hsl(var(--info-text))',
        },

        // Destructive actions
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },

        // Muted elements
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },

        // Accent elements
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },

        // Popover/Dropdown
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },

        // Card components
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
          elevated: 'hsl(var(--card-elevated))',
        },

        // Chart colors
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))',
        },
      },
      borderRadius: {
        none: '0',
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        md: 'var(--radius)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': '1.5rem',
        '3xl': '2rem',
        full: '9999px',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-md)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
        '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
        inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.25)',
        none: 'none',
        // Glass effect shadow
        glass: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      },
      backdropBlur: {
        xs: '2px',
        sm: '4px',
        DEFAULT: '8px',
        md: '12px',
        lg: 'var(--glass-blur)',
        xl: '24px',
        '2xl': '40px',
      },
      transitionDuration: {
        DEFAULT: '200ms',
        75: '75ms',
        100: '100ms',
        150: '150ms',
        200: '200ms',
        300: '300ms',
        500: '500ms',
        700: '700ms',
        1000: '1000ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.4, 0, 0.2, 1)',
        linear: 'linear',
        in: 'cubic-bezier(0.4, 0, 1, 1)',
        out: 'cubic-bezier(0, 0, 0.2, 1)',
        'in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'ease-medical': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
      bkg: {
        low: '#050615',
        med: '#090C29',
        full: '#041C4A',
      },
      info: {
        primary: '#FFFFFF',
        secondary: '#7BB2CE',
      },
      actions: {
        primary: '#348CFD',
        highlight: '#5ACCE6',
        hover: 'rgba(52, 140, 253, 0.2)',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
    // Plugin para agregar utilidades personalizadas
    function ({ addUtilities }) {
      addUtilities({
        '.ease-medical': {
          'transition-timing-function': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        },
      });
    },
  ],
};
