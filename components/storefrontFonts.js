import { Lora, Montserrat, Nunito, Playfair_Display, Poppins, Quicksand, Space_Grotesk } from "next/font/google";

// The font files behind lib/storefrontFontOptions.js. preload: false - a
// font is only downloaded by a page that actually uses it (a storefront
// that picked it, or the settings preview), never by everyone else.
const opts = { subsets: ["latin"], display: "swap", preload: false };
const poppins = Poppins({ ...opts, weight: ["400", "500", "600", "700"] });
const montserrat = Montserrat(opts);
const nunito = Nunito(opts);
const quicksand = Quicksand(opts);
const playfair = Playfair_Display(opts);
const lora = Lora(opts);
const spacegrotesk = Space_Grotesk(opts);

const BY_KEY = { poppins, montserrat, nunito, quicksand, playfair, lora, spacegrotesk };

// The CSS font-family for a stored key, or undefined for the default.
export function storefrontFontFamily(key) {
  return BY_KEY[key]?.style.fontFamily;
}
