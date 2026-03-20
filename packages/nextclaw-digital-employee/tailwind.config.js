/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./app/**/*.{vue,ts}",
    "./components/**/*.{vue,ts}",
    "./shared/**/*.ts"
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))"
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))"
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          muted: "hsl(var(--sidebar-muted))",
          border: "hsl(var(--sidebar-border))",
          accent: "hsl(var(--sidebar-accent))"
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))"
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))"
        }
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
      },
      fontFamily: {
        sans: ["Inter", "PingFang SC", "Microsoft YaHei", "sans-serif"],
        display: ["Outfit", "Inter", "PingFang SC", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"]
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        },
        "fade-out": {
          from: { opacity: "1" },
          to: { opacity: "0" }
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(8px)" },
          to: { opacity: "1", transform: "translateX(0)" }
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "scale(1)" }
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" }
        },
        // 员工卡片工作场景动画
        "subtle-float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-2px)" }
        },
        "head-move": {
          "0%, 100%": { transform: "rotate(0deg)" },
          "30%": { transform: "rotate(2deg)" },
          "70%": { transform: "rotate(-2deg)" }
        },
        "arm-type-left": {
          "0%, 100%": { transform: "rotate(0deg)" },
          "30%": { transform: "rotate(-15deg)" },
          "60%": { transform: "rotate(-5deg)" }
        },
        "arm-type-right": {
          "0%, 100%": { transform: "rotate(0deg)" },
          "30%": { transform: "rotate(5deg)" },
          "60%": { transform: "rotate(15deg)" }
        },
        "screen-glow": {
          "0%, 100%": { boxShadow: "0 0 15px rgba(59, 130, 246, 0.15)" },
          "50%": { boxShadow: "0 0 25px rgba(59, 130, 246, 0.25)" }
        },
        "cursor-blink": {
          "0%, 50%": { opacity: "1" },
          "51%, 100%": { opacity: "0" }
        },
        "plant-sway": {
          "0%, 100%": { transform: "rotate(-2deg)" },
          "50%": { transform: "rotate(2deg)" }
        }
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "fade-out": "fade-out 0.15s ease-in",
        "slide-in-right": "slide-in-right 0.2s ease-out",
        "scale-in": "scale-in 0.15s ease-out",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        // 员工卡片工作场景动画
        "subtle-float": "subtle-float 3s ease-in-out infinite",
        "head-move": "head-move 4s ease-in-out infinite",
        "arm-type-left": "arm-type-left 0.6s ease-in-out infinite",
        "arm-type-right": "arm-type-right 0.6s ease-in-out infinite 0.3s",
        "screen-glow": "screen-glow 3s infinite",
        "cursor-blink": "cursor-blink 1s infinite",
        "plant-sway": "plant-sway 4s ease-in-out infinite"
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
};
