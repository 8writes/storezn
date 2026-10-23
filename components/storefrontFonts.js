import { Lora, Montserrat, Nunito, Playfair_Display, Poppins, Quicksand, Space_Grotesk } from "next/font/google";

// The font files behind lib/storefrontFontOptions.js. preload: false - a
// font is only downloaded by a page that actually uses it (a storefront
// that picked it, or the settings preview), never by everyone else.
// next/font needs every option written out literally on each call (no
// shared object or spread) - it reads them at build time.
const poppins = Poppins({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "500", "600", "700"] });
const montserrat = Montserrat({ subsets: ["latin"], display: "swap", preload: false });
const nunito = Nunito({ subsets: ["latin"], display: "swap", preload: false });
const quicksand = Quicksand({ subsets: ["latin"], display: "swap", preload: false });
const playfair = Playfair_Display({ subsets: ["latin"], display: "swap", preload: false });
const lora = Lora({ subsets: ["latin"], display: "swap", preload: false });
const spacegrotesk = Space_Grotesk({ subsets: ["latin"], display: "swap", preload: false });

const BY_KEY = { poppins, montserrat, nunito, quicksand, playfair, lora, spacegrotesk };

// The CSS font-family for a stored key, or undefined for the default.
export function storefrontFontFamily(key) {
  return BY_KEY[key]?.style.fontFamily;
}
