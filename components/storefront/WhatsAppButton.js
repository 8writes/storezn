import { MessageCircle } from "lucide-react";

// wa.me needs the full international number (country code, no leading
// trunk "0", no "+") - vendors type it in local Nigerian format
// ("0801...", see the WhatsApp field in vendor/settings), which would
// otherwise open a chat to a malformed/nonexistent number.
function toWhatsAppDigits(number) {
  const digits = number.replace(/\D/g, "");
  return digits.startsWith("0") ? `234${digits.slice(1)}` : digits;
}

// Lucide has no dedicated WhatsApp mark (trademarked brand logo), a
// green MessageCircle bubble is the common stand-in without pulling in a
// whole extra icon library for one icon.
//
// Fixed bottom-right on every storefront page (see
// app/storefront/[host]/layout.js) - only renders once the vendor has
// set a WhatsApp number in store settings, see stores.socialLinks in
// lib/db/schema.js.
export function WhatsAppButton({ store }) {
  const number = store?.socialLinks?.whatsapp;
  if (!number) return null;

  return (
    <a
      href={`https://wa.me/${toWhatsAppDigits(number)}`}
      target="_blank"
      rel="noreferrer"
      aria-label={`Chat with ${store.name} on WhatsApp`}
      className="fixed bottom-22 sm:bottom-4 right-5 z-20 flex items-center justify-center h-14 w-14 rounded-full bg-[#25D366] text-white shadow-lg hover:brightness-95 transition-[filter]"
    >
      <MessageCircle size={26} />
    </a>
  );
}
