import { createTheme, type MantineColorsTuple } from "@mantine/core";

// Matches the "Modernist" design system's accent ramp (accent-100..900),
// with the design's base --color-accent inserted at index 5 as the primary shade.
const accent: MantineColorsTuple = [
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

const fontFamily = "Archivo, system-ui, sans-serif";

export const theme = createTheme({
  primaryColor: "accent",
  primaryShade: 5,
  colors: { accent },
  fontFamily,
  headings: { fontFamily, fontWeight: "800" },
  radius: { xs: "0rem", sm: "0rem", md: "0rem", lg: "0rem", xl: "0rem" },
  defaultRadius: "md",
});
