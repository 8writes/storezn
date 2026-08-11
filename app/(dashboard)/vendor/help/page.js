import Link from "next/link";
import { Mail } from "lucide-react";

const JUMP_LINKS = [
  { href: "#start", label: "Get started" },
  { href: "#products", label: "Products" },
  { href: "#orders", label: "Orders" },
  { href: "#payouts", label: "Getting paid" },
  { href: "#phone", label: "Install on your phone" },
  { href: "#faq", label: "Common questions" },
];

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
        same as your store name did. Add a price, a photo, and how many you have in stock, then tap{" "}
        <b>Create product</b>.
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

const FAQ_SECTIONS = [
  {
    id: "products",
    title: "Managing products",
    cards: [
      { q: "Grouping products into categories", a: "While adding a product, type a new category name right there in the \"Add a category\" box — no need to set categories up separately first." },
      { q: "Running out of stock", a: "Your product list shows a warning badge once stock is low, and another once it hits zero, so you know to restock before a customer asks." },
      { q: "Hiding a product", a: "Open the product and turn it off — it disappears from your storefront immediately, but stays saved so you can turn it back on any time." },
      { q: "Used items", a: "When adding a product, set its condition to Fairly Used or Used — customers see this clearly on the product page, so there's no confusion after they buy." },
    ],
  },
  {
    id: "orders",
    title: "Managing orders",
    cards: [
      { q: "A customer paid online", a: "It shows up automatically in Orders — no action needed from you to receive it." },
      { q: "Someone paid you in person / by transfer", a: "Tap \"Record offline order\" at the top of Orders to log a sale that didn't happen through your storefront checkout." },
      { q: "Updating an order's status", a: "Open any order to move it forward — processing, shipped, delivered — so the customer always knows where their order stands." },
      { q: "A customer wants a refund", a: "Refund requests appear on the order itself, where you can review and respond to them directly." },
    ],
  },
  {
    id: "payouts",
    title: "Getting paid",
    cards: [
      { q: "Online orders", a: "Paid into your linked bank account the next business day after the sale — weekends push it to the following Monday." },
      { q: "Offline / in-person orders", a: "Already yours — you collected that money directly, so there's nothing to wait on." },
    ],
  },
  {
    id: "phone",
    title: "Install Storezn on your phone",
    cards: [
      { q: "Android / Chrome", a: "A banner appears at the bottom of the screen — tap Install. That's it." },
      { q: "iPhone / Safari", a: "Tap the Share icon, then \"Add to Home Screen\". This is the only way to install on iPhone — there's no separate button for it." },
    ],
  },
  {
    id: "faq",
    title: "Common questions",
    cards: [
      { q: "Forgot your password?", a: "On the sign-in page, tap \"Forgot password\", enter your email, and follow the link that arrives." },
      { q: "Didn't get a verification email?", a: "Check spam first. Still nothing? Use the resend option on the sign-in page, or contact support below." },
      { q: "Can I run more than one store?", a: "Yes — if you own more than one, a store switcher appears near the top of your dashboard." },
      { q: "Who pays Storezn's fee?", a: "Your choice, in Store settings — either you absorb it from each sale, or it's added on top of what the customer pays." },
    ],
  },
];

export default function VendorHelpPage() {
  return (
    <div className="space-y-10 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Vendor guide</h1>
        <p className="text-sm text-slate-500 mt-1">
          No technical know-how required. Follow the six steps below in order to get your store live, or jump
          straight to whatever you&apos;re stuck on.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2">
        {JUMP_LINKS.map(({ href, label }) => (
          <a
            key={href}
            href={href}
            className="text-xs font-semibold px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700 transition-colors"
          >
            {label}
          </a>
        ))}
      </nav>

      <section id="start" className="scroll-mt-20 space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Get started</h2>
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
      </section>

      {FAQ_SECTIONS.map(({ id, title, cards }) => (
        <section key={id} id={id} className="scroll-mt-20 space-y-4">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {cards.map(({ q, a }) => (
              <div key={q} className="bg-white border border-slate-200 rounded-sm p-4">
                <p className="text-sm font-semibold text-slate-900">{q}</p>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="bg-white border border-slate-200 rounded-sm p-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-bold text-slate-900">Still stuck?</h2>
          <p className="text-sm text-slate-500 mt-1">A real person will read your message — no bots, no ticket numbers to remember.</p>
        </div>
        <Link
          href="mailto:support@ozmictech.com"
          className="inline-flex items-center gap-2 text-sm font-semibold bg-brand-600 text-white px-4 py-2.5 rounded-sm hover:bg-brand-700 transition-colors shrink-0"
        >
          <Mail size={16} />
          Email support
        </Link>
      </section>
    </div>
  );
}
