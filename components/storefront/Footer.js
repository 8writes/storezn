import { Globe, X, Music2 } from "lucide-react";
import { InstagramIcon, FacebookIcon } from "./BrandIcons.js";
import { getPlatformUrl } from "@/lib/storeUrl.js";

// Lucide ships no brand icons in this version (Twitter/Instagram/Facebook
// were all dropped - trademarked marks aren't generic glyphs). X's own
// current logo genuinely is just an X, so lucide's `X` works as-is;
// Instagram/Facebook use small hand-drawn stand-ins (BrandIcons.js), and
// TikTok uses Music2 as the closest available stand-in.
const SOCIAL_ICONS = [
  { key: "website", Icon: Globe, label: "Website" },
  { key: "instagram", Icon: InstagramIcon, label: "Instagram" },
  { key: "twitter", Icon: X, label: "Twitter / X" },
  { key: "facebook", Icon: FacebookIcon, label: "Facebook" },
  { key: "tiktok", Icon: Music2, label: "TikTok" },
];

// Rendered per-store (see app/storefront/[host]/layout.js) - only shows
// an icon for whichever socialLinks the vendor actually filled in, see
// stores.socialLinks in lib/db/schema.js. WhatsApp isn't listed here, it
// only drives the fixed quick-help button (WhatsAppButton.js), it'd be
// redundant to also show it as a footer icon.
// `themed` (Storezn+ with a custom accent color set, see
// app/storefront/[host]/layout.js) swaps the plain white footer for the
// store's own accent as a solid background, matching the header - text/
// icon colors flip to a light-on-color palette so they stay legible.
export function Footer({ store, themed = false }) {
  const links = store?.socialLinks || {};
  const hasAnySocial = SOCIAL_ICONS.some(({ key }) => links[key]);

  return (
    <footer className={themed ? "bg-brand-600" : "border-t border-slate-200 bg-white"}>
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className={`text-sm text-center sm:text-left ${themed ? "text-white" : "text-slate-800"}`}>
          <p>© {new Date().getFullYear()} {store?.name}</p>
          {store?.address && <p className={`text-xs mt-0.5 ${themed ? "text-white" : "text-slate-700"}`}>{store.address}</p>}
        </div>

        {hasAnySocial && (
          <div className="flex items-center gap-4">
            {SOCIAL_ICONS.filter(({ key }) => links[key]).map(({ key, Icon, label }) => (
              <a
                key={key}
                href={links[key]}
                target="_blank"
                rel="noreferrer"
                aria-label={label}
                className={themed ? "text-white/90 hover:text-white transition-colors" : "text-slate-700 hover:text-brand-600 transition-colors"}
              >
                <Icon size={18} />
              </a>
            ))}
          </div>
        )}

        <div className={`flex items-center gap-4 text-xs ${themed ? "text-white" : "text-slate-700"}`}>
          <a href="/orders" className={`font-medium transition-colors ${themed ? "hover:text-white" : "hover:text-brand-600"}`}>
            Track an order
          </a>
          <a href={getPlatformUrl("/signup")} className={`font-medium transition-colors ${themed ? "hover:text-white" : "hover:text-brand-600"}`}>
            Get your own website
          </a>
          <p>
            Powered by{" "}
            <a href="https://ozmictech.com" target="_blank" rel="noreferrer" className={`transition-colors ${themed ? "hover:text-white" : "hover:text-brand-600"}`}>
              Ozmictech
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
