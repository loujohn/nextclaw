export default defineNuxtConfig({
  compatibilityDate: "2026-03-11",
  devtools: { enabled: true },
  css: ["~/assets/css/tailwind.css"],
  postcss: {
    plugins: {
      tailwindcss: {
        config: "./tailwind.config.cjs"
      },
      autoprefixer: {}
    }
  },
  app: {
    head: {
      link: [
        {
          rel: "preconnect",
          href: "https://fonts.googleapis.com"
        },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossorigin: ""
        },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
        }
      ]
    }
  },
  nitro: {
    esbuild: {
      options: {
        target: "es2022"
      }
    },
    serverAssets: [
      {
        baseName: "skills",
        dir: "./skills"
      }
    ]
  },
  typescript: {
    strict: true,
    typeCheck: false
  }
});
