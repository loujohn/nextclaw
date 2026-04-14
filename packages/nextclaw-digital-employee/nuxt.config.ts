export default defineNuxtConfig({
  compatibilityDate: "2026-03-11",
  devtools: { enabled: true },
  modules: ["@pinia/nuxt"],
  runtimeConfig: {
    keycloakUrl: process.env.KEYCLOAK_URL ?? "",
    keycloakRealm: process.env.KEYCLOAK_REALM ?? "",
    jwtSecret: process.env.JWT_SECRET ?? "de-platform-default-secret-change-me",
    public: {
      keycloakUrl: process.env.KEYCLOAK_URL ?? "",
      keycloakRealm: process.env.KEYCLOAK_REALM ?? "",
      keycloakClientId: process.env.KEYCLOAK_CLIENT_ID ?? "de-platform",
    },
  },
  css: [
    "@fontsource/inter/400.css",
    "@fontsource/inter/500.css",
    "@fontsource/inter/600.css",
    "@fontsource/inter/700.css",
    "@fontsource/outfit/500.css",
    "@fontsource/outfit/600.css",
    "@fontsource/outfit/700.css",
    "@fontsource/jetbrains-mono/400.css",
    "@fontsource/jetbrains-mono/500.css",
    "~/assets/css/tailwind.css"
  ],
  postcss: {
    plugins: {
      tailwindcss: {
        config: "./tailwind.config.cjs"
      },
      autoprefixer: {}
    }
  },
  nitro: {
    output: {
      dir: "dist"
    },
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
    typeCheck: true
  }
});
