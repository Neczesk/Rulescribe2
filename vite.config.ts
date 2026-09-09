/// <reference types="vitest/config" />

import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  // Change this if your GitHub repository has a different name.
  const githubPagesBase = "/Rulescribe2/";

  // Normal dev/production builds live at /.
  // Only the special GitHub Pages build lives under /RuleScribe/.
  const base = mode === "github-pages" ? githubPagesBase : "/";

  return {
    base,

    plugins: [
      react(),

      babel({
        presets: [reactCompilerPreset()],
      }),

      VitePWA({
        registerType: "autoUpdate",

        manifest: {
          name: "RuleScribe",
          short_name: "RuleScribe",
          description:
            "Local-only editor and army list builder for tabletop wargame rulesets. Works offline; all data stays on your device.",
          lang: "en",
          display: "standalone",
          orientation: "any",

          // These need to follow the Vite base.
          start_url: base,
          scope: base,

          theme_color: "#ec3013",
          background_color: "#f3f2f2",

          categories: ["productivity", "games", "utilities"],

          // Relative URLs work both at / and /RuleScribe/.
          icons: [
            {
              src: "pwa-192x192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "pwa-512x512.png",
              sizes: "512x512",
              type: "image/png",
            },
            {
              src: "pwa-maskable-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
            {
              src: "icon.svg",
              sizes: "any",
              type: "image/svg+xml",
            },
          ],
        },

        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],

          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,

          cleanupOutdatedCaches: true,

          navigateFallback: "index.html",

          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com",
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "google-fonts-stylesheets",
              },
            },
            {
              urlPattern: ({ url }) => url.origin === "https://fonts.gstatic.com",
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-webfonts",
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
      }),
    ],

    build: {
      sourcemap: true,
    },

    test: {
      environment: "node",
    },
  };
});
