"use client";
import { useState } from "react";
import Link from "next/link";
import { Mail, MessageCircle } from "lucide-react";

const SUPPORT_EMAIL = "support@ozmictech.com";
// Local Nigerian format as given - normalized the same way
// components/storefront/WhatsAppButton.js does, since wa.me needs the full
// international number (country code, no leading trunk "0").
const SUPPORT_WHATSAPP = "09153374542".replace(/^0/, "234");

const STEPS = [
  {
    title: "Create your store",
    body: (
      <>
        <p>
          Go to the sign-up page and tap <b>Start selling</b>. Type your store&apos;s name — your Store URL fills
          itself in automatically, so you don&apos;t need to figure that part out. Then enter your name, email, and
          a password, and tap <b>Create my store</b>.
        </p>
        <p>Check your email and tap the verification link. This confirms it&apos;s really you.</p>
      </>
    ),
  },
  {
    title: "Verify your identity",
    body: (
      <>
        <p>
          In your dashboard, open <b>Verification</b> in the menu. Enter your NIN (your 11-digit National
          Identification Number) and tap <b>Submit for review</b>.
        </p>
        <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-3 py-2 text-sm">
          You can still set up your store and add products before this is approved — but customers can&apos;t see
          your store or place orders until it is.
        </p>
      </>
    ),
  },
  {
    title: "Set up your store's look",
    body: (
      <p>
        Open <b>Store settings</b>. Upload your logo, and add your WhatsApp number and any social media links you
        have — these show up on your storefront so customers can find and trust you.
      </p>
    ),
  },
  {
    title: "Link your bank account",
    body: (
      <p>
        Still in <b>Store settings</b>, add your bank details. This is the account your money gets paid into
        whenever someone buys from you online.
      </p>
    ),
  },
  {
    title: "Add your first product",
    body: (
      <p>
        Open <b>Products</b> → <b>Add product</b>. Type a name — the product&apos;s web address fills in by itself,
        same as your store name did. Add a price, up to 10 photos (each under 1MB), and how many you have in
        stock, then tap <b>Create product</b>.
      </p>
    ),
  },
  {
    title: "You're live",
    body: (
      <p>
        Once your identity is verified, share your store&apos;s link (or its QR code, from <b>Store settings</b>)
        anywhere — WhatsApp status, Instagram bio, wherever your customers already are.
      </p>
    ),
  },
];

const SECTIONS = [
  {
    id: "start",
    label: "Get started",
    render: () => (
      <div className="space-y-3">
        {STEPS.map((step, i) => (
          <div key={step.title} className="bg-white border border-slate-200 rounded-sm p-5 flex gap-4">
            <div className="shrink-0 w-8 h-8 rounded-sm bg-brand-100 text-brand-700 font-bold text-sm flex items-center justify-center">
              {i + 1}
            </div>
            <div className="space-y-2 text-sm text-slate-600 leading-relaxed">
              <h3 className="font-semibold text-slate-900 text-[15px]">{step.title}</h3>
              {step.body}
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "products",
    label: "Products",
    cards: [
      { q: "Grouping products into categories", a: "While adding a product, type a new category name right there in the \"Add a category\" box — no need to set categories up separately first." },
      { q: "Running out of stock", a: "Your product list shows a warning badge once stock is low, and another once it hits zero, so you know to restock before a customer asks." },
      { q: "Hiding a product", a: "Open the product and turn it off — it disappears from your storefront immediately, but stays saved so you can turn it back on any time." },
      { q: "Used items", a: "When adding a product, set its condition to Fairly Used or Used — customers see this clearly on the product page, so there's no confusion after they buy." },
    ],
  },
  {
    id: "orders",
    label: "Orders",
    cards: [
      { q: "A customer paid online", a: "It shows up automatically in Orders — no action needed from you to receive it." },
      { q: "Someone paid you in person / by transfer", a: "Tap \"Record offline order\" at the top of Orders to log a sale that didn't happen through your storefront checkout." },
      { q: "Updating an order's status", a: "Open any order to move it forward — processing, shipped, delivered — so the customer always knows where their order stands." },
      { q: "A customer wants a refund", a: "Refund requests appear on the order itself, where you can review and respond to them directly." },
    ],
  },
  {
    id: "payouts",
    label: "Getting paid",
    cards: [
      { q: "Online orders", a: "Paid into your linked bank account the next business day after the sale — weekends push it to the following Monday." },
      { q: "Offline / in-person orders", a: "Already yours — you collected that money directly, so there's nothing to wait on." },
    ],
  },
  {
    id: "phone",
    label: "Install on your phone",
    cards: [
      { q: "Android / Chrome", a: "A banner appears at the bottom of the screen — tap Install. That's it." },
      { q: "iPhone / Safari", a: "Tap the Share icon, then \"Add to Home Screen\". This is the only way to install on iPhone — there's no separate button for it." },
    ],
  },
  {
    id: "faq",
    label: "Common questions",
    cards: [
      { q: "Forgot your password?", a: "On the sign-in page, tap \"Forgot password\", enter your email, and follow the link that arrives." },
      { q: "Didn't get a verification email?", a: "Check spam first. Still nothing? Use the resend option on the sign-in page, or contact support below." },
      { q: "Can I run more than one store?", a: "Yes — if you own more than one, a store switcher appears near the top of your dashboard." },
      { q: "Who pays Storezn's fee?", a: "Your choice, in Store settings — either you absorb it from each sale, or it's added on top of what the customer pays." },
    ],
  },
];

function SectionBody({ section }) {
  if (section.render) return section.render();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {section.cards.map(({ q, a }) => (
        <div key={q} className="bg-white border border-slate-200 rounded-sm p-4">
          <p className="text-sm font-semibold text-slate-900">{q}</p>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">{a}</p>
        </div>
      ))}
    </div>
  );
}

export function HelpGuideContent() {
  const [activeId, setActiveId] = useState(null);

  const toggle = (id) => setActiveId((current) => (current === id ? null : id));
  const visibleSections = activeId ? SECTIONS.filter((s) => s.id === activeId) : SECTIONS;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Vendor guide</h1>
        <p className="text-sm text-slate-500 mt-1">
          No technical know-how required. Tap a topic below to jump straight to it, or leave nothing selected to
          read everything in order.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2">
        {SECTIONS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => toggle(id)}
            aria-pressed={activeId === id}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
              activeId === id
                ? "bg-brand-600 border-brand-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700"
            }`}
          >
            {label}
          </button>
        ))}
        {activeId && (
          <button
            type="button"
            onClick={() => setActiveId(null)}
            className="text-xs font-semibold px-3 py-1.5 rounded-full text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            Show all
          </button>
        )}
      </nav>

      {visibleSections.map((section) => (
        <section key={section.id} className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900">{section.label}</h2>
          <SectionBody section={section} />
        </section>
      ))}

      <section className="bg-white border border-slate-200 rounded-sm p-6 space-y-4">
        <div>
          <h2 className="font-bold text-slate-900">Still stuck?</h2>
          <p className="text-sm text-slate-500 mt-1">A real person will read your message — no bots, no ticket numbers to remember.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-brand-600 text-white px-4 py-2.5 rounded-sm hover:bg-brand-700 transition-colors"
          >
            <Mail size={16} />
            Email support
          </Link>
          <a
            href={`https://wa.me/${SUPPORT_WHATSAPP}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold bg-[#25D366] text-white px-4 py-2.5 rounded-sm hover:brightness-95 transition-[filter]"
          >
            <MessageCircle size={16} />
            WhatsApp us (faster)
          </a>
        </div>
      </section>
    </div>
  );
}
