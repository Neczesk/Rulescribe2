import { createTheme, type MantineColorsTuple, virtualColor } from "@mantine/core";

// Matches the "Modernist" design system's accent ramp (accent-100..900),
// with the design's base --color-accent inserted at index 5 as the primary shade.
const accentRed: MantineColorsTuple = [
  "#fff2ef",
  "#ffe0d9",
  "#ffc4b8",
  "#ff9783",
  "#ff563c",
  "#ec3013",
  "#dd2b0f",
  "#ae1800",
  "#7c1405",
  "#4d170e",
];

// Dark-mode accent — the "Nightwatch" export theme's gold (#d9a13b at index 5),
// which reads better than the brand red against the near-black dark ground.
const accentGold: MantineColorsTuple = [
  "#fbf4e4",
  "#f3e6c6",
  "#ead2a0",
  "#e2bd77",
  "#dcad55",
  "#d9a13b",
  "#c08a2c",
  "#9a6b1f",
  "#6f4c14",
  "#4a330d",
];

const fontFamily = "Archivo, system-ui, sans-serif";

export const theme = createTheme({
  primaryColor: "accent",
  primaryShade: 5,
  colors: {
    "accent-red": accentRed,
    "accent-gold": accentGold,
    // Resolves to accent-red in light, accent-gold in dark. Components keep
    // using color="accent"; the swap is automatic with the color scheme.
    accent: virtualColor({ name: "accent", light: "accent-red", dark: "accent-gold" }),
  },
  fontFamily,
  headings: { fontFamily, fontWeight: "800" },
  radius: { xs: "0rem", sm: "0rem", md: "0rem", lg: "0rem", xl: "0rem" },
  defaultRadius: "md",
});
