// Generates a brand-50..900 shade ramp from a single accent hex, so a
// vendor's one color pick (see stores.storefrontAccentColor) can override
// every existing --color-brand-* CSS variable Tailwind v4 already emits
// from app/globals.css's @theme block - every bg-brand-600/text-brand-500/
// etc. class already used throughout the storefront (cart, checkout,
// footer, shared Button component) picks it up automatically once these
// are set as inline custom properties on the storefront's root element,
// with no per-component edits needed. Scoped to that subtree only, so the
// vendor dashboard (which uses the same token names) is unaffected.

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const int = parseInt(clean, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function rgbToHex({ r, g, b }) {
  const toHex = (n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Mixes `hex` toward `target` by `percent` (0-100) of the way there.
function mix(hex, target, percent) {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  const p = percent / 100;
  return rgbToHex({
    r: a.r + (b.r - a.r) * p,
    g: a.g + (b.g - a.g) * p,
    b: a.b + (b.b - a.b) * p,
  });
}

// The picked color anchors shade 600 (matches Button.js's primary variant,
// bg-brand-600), the rest of the ramp is interpolated toward white (lighter
// shades) or black (darker shades) from there.
export function generateBrandShades(accentHex) {
  return {
    "--color-brand-50": mix(accentHex, "#ffffff", 95),
    "--color-brand-100": mix(accentHex, "#ffffff", 88),
    "--color-brand-200": mix(accentHex, "#ffffff", 76),
    "--color-brand-300": mix(accentHex, "#ffffff", 60),
    "--color-brand-400": mix(accentHex, "#ffffff", 32),
    "--color-brand-500": mix(accentHex, "#ffffff", 14),
    "--color-brand-600": accentHex,
    "--color-brand-700": mix(accentHex, "#000000", 15),
    "--color-brand-800": mix(accentHex, "#000000", 30),
    "--color-brand-900": mix(accentHex, "#000000", 45),
  };
}
