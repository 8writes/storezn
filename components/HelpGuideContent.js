"use client";
import { useState } from "react";
import Link from "next/link";
import { Mail, MessageCircle, Search } from "lucide-react";

const SUPPORT_EMAIL = "support@ozmictech.com";
// Local Nigerian format as given - normalized the same way
// components/storefront/WhatsAppButton.js does, since wa.me needs the full
// international number (country code, no leading trunk "0").
const SUPPORT_WHATSAPP = "09153374542".replace(/^0/, "234");

const STEPS = [
  {
    title: "Create your store",
    keywords: "create store sign up start selling store url slug create my store verify email",
    body: (
      <>
        <p>
          On the sign-up page tap <b>Start selling</b>. Type your store&apos;s name - the <b>Store URL</b> (your
          <code> yourname.storezn.com</code> address) fills itself in. Add your name, email and a password, then tap
          <b> Create my store</b>.
        </p>
        <p>Open the email we send and tap the link to confirm your address. You can&apos;t sign in until this is done.</p>
      </>
    ),
  },
  {
    title: "Verify your identity (NIN)",
    keywords: "verify identity nin national identification number submit review approval store live hidden",
    body: (
      <>
        <p>
          In the dashboard open <b>Verification</b>, enter your 11-digit <b>NIN</b> and tap <b>Submit for review</b>.
        </p>
        <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-3 py-2 text-sm">
          You can build your whole store while this is pending, but <b>customers can&apos;t see it or order</b> until
          it&apos;s approved. You&apos;ll get a notification when it is.
        </p>
      </>
    ),
  },
  {
    title: "Brand your store",
    keywords: "logo favicon store settings description whatsapp social links branding look ships from location",
    body: (
      <p>
        Open <b>Store settings</b>. Upload a <b>logo</b> (wide) and a <b>favicon</b> (small round tab icon), write a
        short <b>description</b>, and add your <b>WhatsApp number</b> and social links - these show in your storefront
        footer, and WhatsApp also powers the floating chat button. Set your <b>store location</b> (the state you ship
        from); you can hide the &quot;Ships from&quot; line on product pages with the toggle right there.
      </p>
    ),
  },
  {
    title: "Link your bank account",
    keywords: "bank account payout paystack subaccount link money paid checkout blocked",
    body: (
      <p>
        Open <b>Payouts</b> and add your bank details. We verify them through Paystack and set up automatic payouts.
        <b> Customers can&apos;t check out until this is linked</b>. It&apos;s locked afterwards for security - contact
        support to change it.
      </p>
    ),
  },
  {
    title: "Add your first product",
    keywords: "add product name price photos video stock condition create product",
    body: (
      <p>
        Open <b>Products</b> &rarr; <b>Add product</b>. Name it (the URL slug fills in), set a <b>price</b>, add up to
        <b> 5 photos and video combined</b> (photos under 1MB, one clip up to 20MB / 30s), and enter your <b>stock</b>.
        Optional extras live under &quot;Show optional fields&quot;: SKU, discount %, category, and a size guide.
      </p>
    ),
  },
  {
    title: "Share your link and sell",
    keywords: "share store link qr code live storefront whatsapp instagram marketplace",
    body: (
      <p>
        Once you&apos;re verified, your store link (and its <b>QR code</b>) is on your dashboard - share it on WhatsApp
        status, your Instagram bio, anywhere. Your products also appear in the Storezn <b>marketplace</b> unless you
        turn that off in Store settings.
      </p>
    ),
  },
];

const card = (q, a) => ({ q, a });

const SECTIONS = [
  {
    id: "start",
    label: "Get started",
    render: (steps) => (
      <div className="space-y-3">
        {steps.map((step) => (
          <div key={step.title} className="bg-white border border-slate-200 rounded-sm p-5 flex gap-4">
            <div className="shrink-0 w-8 h-8 rounded-sm bg-brand-100 text-brand-700 font-bold text-sm flex items-center justify-center">
              {STEPS.indexOf(step) + 1}
            </div>
            <div className="space-y-2 text-sm text-slate-700 leading-relaxed">
              <h3 className="font-semibold text-slate-900 text-[15px]">{step.title}</h3>
              {step.body}
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "storefront",
    label: "Your storefront",
    cards: [
      card("Your store link & QR", "Both are on your dashboard once you're verified. The QR is handy for a shop sign, flyer, or receipt."),
      card("Going offline temporarily", "Store settings → Store status. Turned off, customers see a \"closed\" page instead of your products; your link keeps working, it just isn't taking orders."),
      card("Marketplace listing", "On by default - your products are discoverable in the Storezn marketplace on top of your own link. Turn it off in Store settings; your own storefront is unaffected."),
      card("Accent colour (Storezn+)", "Store settings → Storefront theme. Pick one colour and your header, buttons, prices and filters all follow it. Free stores use the default green."),
      card("Custom domain (Storezn+)", "Store settings → Custom domain. Add your own e.g. shop.yourbrand.com, point its DNS as shown, then tap Verify. Links only switch to it once it's verified."),
    ],
  },
  {
    id: "products",
    label: "Products",
    cards: [
      card("Editing a product", "Open it → Edit. Photo changes (add / remove / reorder) and the video save immediately; everything else saves when you tap Save changes."),
      card("Discount", "Set \"Discount %\" (1-99). It actually reduces the price charged and shows a \"was / now\" on the storefront. It only applies to the base price, not a variant's own price override."),
      card("Low / out of stock", "Your product list flags low stock with an amber badge and zero stock with a red one, so you can restock before a customer asks."),
      card("Hiding vs deleting", "Set a product to Hidden to pull it from the storefront while keeping it saved. You can only permanently delete a product that has never been ordered - deactivate ordered ones instead."),
      card("Used items", "Set the condition to Fairly Used or Used when adding the product. Shoppers see it clearly on the product page and card."),
      card("Bulk import (CSV)", "Products page → \"Import products from a CSV\". Download the template. Only name and price are required; blank cells are fine; categoryName must exactly match one of your existing categories. A preview shows before you commit."),
    ],
  },
  {
    id: "categories",
    label: "Categories",
    cards: [
      card("Managing categories", "Products → Manage categories (or the Categories page). Add, rename and delete there - the list is shared across every product and is what powers the storefront's category filter."),
      card("Assigning a category", "Pick one from the Category dropdown on the add/edit product form. \"No category\" is always an option."),
      card("Deleting a category", "Its products aren't deleted - they just lose that category. The page warns you how many products are affected first."),
    ],
  },
  {
    id: "variants",
    label: "Variants & options",
    cards: [
      card("What a variant is", "A buyable version of a product with its own price and stock - e.g. Size: M, or Colour: Red. Add them on the product's Edit page."),
      card("Creating them fast", "Type an option name (Size) and comma-separated values (S, M, L). Tap \"+ Add another option\" for a second dimension (Colour) and \"Generate variants\" builds one variant for every combination - existing ones are skipped."),
      card("Price & stock per variant", "Generate first, then tap the pencil on any variant row to set its price override and stock. Leaving price blank means it uses the product's own price."),
      card("The \"Standard\" option", "By default a variant product still lets shoppers buy the plain product alongside the options. Turn off \"Show a Standard option\" so they must pick a variant."),
      card("Bulk delete / rebuild", "Tick rows and use \"Delete selected\", or \"Delete all\". Changing the option names on a product that already has variants prompts a rebuild."),
      card("Can't add to cart on the storefront", "Usually means a product has variants under two option names but no combination variant that has both. Open it and hit \"Generate variants\" to rebuild the grid."),
    ],
  },
  {
    id: "sizeguide",
    label: "Size guide",
    cards: [
      card("Adding one", "Edit product → Size guide → \"Add size guide\". Set a unit (cm/inch), name your size systems (e.g. UK and optionally EUR), add measurement columns, then a row per size."),
      card("How shoppers use it", "A \"Size guide\" link opens the full table with a cm/inch toggle. If your size names match your Size variant values, the picked size's measurements also show inline, with a \"N left\" badge."),
      card("Fit tip", "The note field (\"Runs large - go one size down\") shows under the size options on the storefront."),
    ],
  },
  {
    id: "orders",
    label: "Orders (online)",
    cards: [
      card("New orders", "Paid online orders appear in Orders automatically - nothing to accept."),
      card("Moving an order along", "Open it and advance the status: processing → shipped → delivered, so the customer always knows where things stand. There's a PDF button for a receipt/waybill."),
      card("\"Abandoned\"", "The checkout was started but never paid. These are swept automatically after a while and their reserved stock is released."),
      card("Delivery fee \"to be determined\"", "If your default shipping is TBD, you confirm the real fee on the order before you can move it forward - it's record-keeping, the customer already paid the goods total."),
    ],
  },
  {
    id: "pos",
    label: "Record a sale in person",
    cards: [
      card("Opening the POS", "Orders → \"Record offline order\". Search your catalogue, tap a product to add it (again to bump quantity), pick a variant if it has them."),
      card("Buyer details", "Name / phone / email are optional - fill in what you have for your own records."),
      card("Fees", "The platform takes no commission on an offline sale - you already collected that money directly, so it's fully yours."),
    ],
  },
  {
    id: "payouts",
    label: "Payments & payouts",
    cards: [
      card("When you get paid", "Online orders settle to your linked bank account the next business day (weekends roll to Monday). \"Check settlements\" on the Payouts page pulls the latest status from Paystack."),
      card("Offline orders", "Nothing to wait for - you took that payment in person."),
      card("The platform fee", "One fee per online order: a percentage plus a small flat amount, shown on each order as \"Platform fee (x% + ₦…)\"."),
      card("Who pays it", "Your choice in Store settings → Fees. Either you absorb it from your payout, or it's added on top of what the customer pays at checkout."),
    ],
  },
  {
    id: "refunds",
    label: "Refunds",
    cards: [
      card("How a request reaches you", "The customer raises it from their order; it then shows on that order in your dashboard for you to approve or reject (a reject needs a reason, which they see)."),
      card("Approving is record-keeping only", "It doesn't move any money - Storezn never held it. You send the refund yourself (bank transfer or your Paystack dashboard) and then mark it approved. Your commission on that order isn't returned either."),
    ],
  },
  {
    id: "shipping",
    label: "Shipping",
    cards: [
      card("Default fee", "Shipping page → a flat fee for anywhere you don't have a specific rate, or \"To be determined\" so you confirm each order's delivery cost yourself."),
      card("Rates by area", "Add fixed rates per state, or per city within a state. A city rate beats a state rate, which beats your default."),
    ],
  },
  {
    id: "branches",
    label: "Branches (multi-location)",
    cards: [
      card("What they're for", "If you sell from more than one location, each branch tracks its own stock. Every product starts stocked at your default branch; allocate to others from the product's Edit page."),
      card("Orders & branches", "An online order is fulfilled from the first branch that can cover the whole cart. Staff can be scoped to a single branch."),
    ],
  },
  {
    id: "staff",
    label: "Staff",
    cards: [
      card("Adding someone", "Staff page → invite by email. They set their own password from the email and get a trimmed dashboard."),
      card("What staff can do", "Manage products, categories, orders, customers and store settings. They can't see payouts, verification, Storezn+, the staff list, or delete/disable the account."),
      card("Removing / leaving", "Owners remove staff from the Staff page; a staff member can leave a store themselves from their Profile."),
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    cards: [
      card("What's there", "Vendor → Analytics: revenue and order trends, status and channel (online/offline) breakdowns, top products / categories / customers, branch split, and refund / stock health."),
      card("Filtering", "Pick a date range (presets or custom), and optionally a branch and channel - every section updates together."),
    ],
  },
  {
    id: "plus",
    label: "Storezn+",
    cards: [
      card("What it unlocks", "A custom storefront accent colour, a custom domain, and higher storage / staff / branch limits."),
      card("Billing", "A monthly charge via Paystack, billed automatically. Cancel any time from the Storezn Plus page - you keep the perks until the paid period ends."),
    ],
  },
  {
    id: "notifications",
    label: "Notifications",
    cards: [
      card("Turning them on", "Store settings has a push-notification toggle. Enable it once per browser/device you want alerts on."),
      card("What you get pinged for", "A new order, and low-stock warnings, so you don't have to keep refreshing the dashboard."),
    ],
  },
  {
    id: "phone",
    label: "Install on your phone",
    cards: [
      card("Android / Chrome", "An \"Install\" banner appears at the bottom of the screen - tap it."),
      card("iPhone / Safari", "Tap the Share icon, then \"Add to Home Screen\". That's the only way to install on iOS."),
    ],
  },
  {
    id: "account",
    label: "Your account",
    cards: [
      card("Password & details", "Profile page - change your password, name and phone, and toggle order-update emails."),
      card("Disabling your account", "Profile → Disable account. It suspends you and takes your storefront offline, but deletes nothing. Contact support to reopen it or to permanently delete everything."),
    ],
  },
  {
    id: "faq",
    label: "Troubleshooting",
    cards: [
      card("Forgot your password", "Sign-in page → \"Forgot password\", enter your email, follow the link."),
      card("No verification email", "Check spam. Still nothing - use the resend option on the sign-in page, or contact support."),
      card("\"Customers can't check out\"", "You need three things: identity verified, bank account linked, and your store status set to open."),
      card("Store link opens to nothing", "Your identity verification is still pending or was rejected - check the Verification page."),
      card("Can't delete a product", "It's been ordered before. Deleting it would break past order records - set it to Hidden instead."),
      card("A page won't load / says Unauthorized", "Usually a momentary hiccup while signing in - refresh once. If it sticks, sign out and back in, or contact support."),
    ],
  },
];

function matchesQuery(text, query) {
  return String(text).toLowerCase().includes(query);
}

function stepMatches(step, query) {
  return matchesQuery(step.title, query) || matchesQuery(step.keywords, query);
}

function SectionBody({ section, query }) {
  if (section.render) {
    const steps = query ? STEPS.filter((s) => stepMatches(s, query)) : STEPS;
    return section.render(steps);
  }
  const cards = query
    ? section.cards.filter(({ q: question, a }) => matchesQuery(question, query) || matchesQuery(a, query))
    : section.cards;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {cards.map(({ q, a }) => (
        <div key={q} className="bg-white border border-slate-200 rounded-sm p-4">
          <p className="text-sm font-semibold text-slate-900">{q}</p>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">{a}</p>
        </div>
      ))}
    </div>
  );
}

function sectionMatchCount(section, query) {
  if (!query) return 1;
  if (section.render) return STEPS.filter((s) => stepMatches(s, query)).length;
  return section.cards.filter(({ q, a }) => matchesQuery(q, query) || matchesQuery(a, query)).length;
}

export function HelpGuideContent() {
  const [activeId, setActiveId] = useState(null);
  const [search, setSearch] = useState("");

  const toggle = (id) => {
    setSearch("");
    setActiveId((current) => (current === id ? null : id));
  };
  const query = search.trim().toLowerCase();

  // A search in progress overrides the topic chips entirely - it looks
  // across every section for matches instead of just the selected one.
  const visibleSections = query
    ? SECTIONS.filter((s) => sectionMatchCount(s, query) > 0)
    : activeId
      ? SECTIONS.filter((s) => s.id === activeId)
      : SECTIONS;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Vendor guide</h1>
        <p className="text-sm text-slate-500 mt-1">
          Everything you need to run your store. Search for anything, tap a topic to jump to it, or scroll to read it
          all. No technical know-how required.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setActiveId(null);
            setSearch(e.target.value);
          }}
          placeholder="Search the guide..."
          className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-sm text-base outline-none focus:border-brand-500"
        />
      </div>

      <nav className="flex flex-wrap gap-2">
        {SECTIONS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => toggle(id)}
            aria-pressed={activeId === id}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors cursor-pointer whitespace-nowrap ${
              activeId === id
                ? "bg-brand-600 border-brand-600 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:text-brand-700"
            }`}
          >
            {label}
          </button>
        ))}
        {activeId && (
          <button
            type="button"
            onClick={() => setActiveId(null)}
            className="text-xs font-semibold px-3 py-1.5 rounded-full text-slate-700 hover:text-slate-700 cursor-pointer whitespace-nowrap"
          >
            Show all
          </button>
        )}
      </nav>

      {query && visibleSections.length === 0 && (
        <p className="text-sm text-slate-700">Nothing matches &quot;{search.trim()}&quot; - try a different word, or contact support below.</p>
      )}

      {visibleSections.map((section) => (
        <section key={section.id} className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900">{section.label}</h2>
          <SectionBody section={section} query={query} />
        </section>
      ))}

      <section className="bg-white border border-slate-200 rounded-sm p-6 space-y-4">
        <div>
          <h2 className="font-bold text-slate-900">Still stuck?</h2>
          <p className="text-sm text-slate-500 mt-1">A real person will read your message - no bots, no ticket numbers to remember.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-brand-600 text-white px-4 py-2.5 rounded-sm hover:bg-brand-700 transition-colors whitespace-nowrap"
          >
            <Mail size={16} />
            Email support
          </Link>
          <a
            href={`https://wa.me/${SUPPORT_WHATSAPP}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold bg-[#25D366] text-white px-4 py-2.5 rounded-sm hover:brightness-95 transition-[filter] whitespace-nowrap"
          >
            <MessageCircle size={16} />
            WhatsApp us (faster)
          </a>
        </div>
      </section>
    </div>
  );
}
