import { defineConfig } from "@vite-pwa/assets-generator/config";

// Generates the PWA icon set from a single source image.
//   npm run generate:pwa-assets
//
// Source: put a square, high-res logo at public/logo.svg (SVG preferred; a
// >=512px PNG also works). Output PNGs land in public/ with the exact names
// the manifest + index.html already reference:
//   pwa-192x192.png, pwa-512x512.png,
//   pwa-maskable-512x512.png, apple-touch-icon-180x180.png
export default defineConfig({
  headLinkOptions: { preset: "2023" },
  images: ["public/logo.svg"],
  preset: {
    transparent: {
      sizes: [192, 512],
      favicons: [[48, "favicon.ico"]],
    },
    maskable: {
      sizes: [512],
      // Extra padding so the mark stays inside the maskable safe zone.
      padding: 0.3,
      resizeOptions: { background: "#f3f2f2" },
    },
    apple: {
      sizes: [180],
      padding: 0.3,
      // Apple icons must be opaque.
      resizeOptions: { background: "#f3f2f2" },
    },
    assetName: (type, { width, height }) => {
      switch (type) {
        case "transparent":
          return `pwa-${width}x${height}.png`;
        case "maskable":
          return `pwa-maskable-${width}x${height}.png`;
        case "apple":
          return `apple-touch-icon-${width}x${height}.png`;
      }
    },
  },
});
