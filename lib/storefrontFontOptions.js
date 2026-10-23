// Fonts a Storezn+ store can choose for its storefront (stores.storefrontFont).
// Plain data, safe anywhere - the actual font files are loaded in
// components/storefrontFonts.js. null/"" = the platform font (DM Sans).
export const STOREFRONT_FONTS = [
  { key: "poppins", label: "Poppins", vibe: "Bold & popular" },
  { key: "montserrat", label: "Montserrat", vibe: "Strong & modern" },
  { key: "nunito", label: "Nunito", vibe: "Soft & friendly" },
  { key: "quicksand", label: "Quicksand", vibe: "Light & playful" },
  { key: "playfair", label: "Playfair Display", vibe: "Elegant - fashion, beauty" },
  { key: "lora", label: "Lora", vibe: "Classic - food, books" },
  { key: "spacegrotesk", label: "Space Grotesk", vibe: "Techy - gadgets" },
];

export const STOREFRONT_FONT_KEYS = STOREFRONT_FONTS.map((f) => f.key);
