export default defineNuxtConfig({
  compatibilityDate: "2026-03-11",
  devtools: { enabled: true },
  css: ["~/assets/main.css"],
  nitro: {
    esbuild: {
      options: {
        target: "es2022"
      }
    }
  },
  typescript: {
    strict: true,
    typeCheck: false
  }
});
