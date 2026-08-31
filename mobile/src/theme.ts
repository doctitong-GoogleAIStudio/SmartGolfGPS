// Shared design tokens — mirrors the web app's "Performance Pro meets Luxury"
// palette (see /app/design_guidelines.json). One brand across web + mobile.
export const colors = {
  bg: "#FDFDFD",
  surface: "#F4F4F5",
  green: "#14532D",
  fairway: "#22C55E",
  gold: "#D4AF37",
  charcoal: "#0F0F10",
  red: "#EF4444",
  water: "#0EA5E9",
  white: "#FFFFFF",
  zinc100: "#F4F4F5",
  zinc200: "#E4E4E7",
  zinc300: "#D4D4D8",
  zinc400: "#A1A1AA",
  zinc500: "#71717A",
  zinc600: "#52525B",
};

// Loaded remotely in the root layout via expo-font. Falls back to system if the
// fetch fails (icons/tofu-safe).
export const fonts = {
  num: "Anton", // big condensed distance numbers
  head: "Manrope", // headings (Manrope 800)
  body: "Manrope",
};

export const font = {
  num: "Anton",
  headBold: "Manrope",
};
