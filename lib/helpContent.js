// The vendor help guide's words, kept apart from its layout
// (components/HelpGuideContent.js) so the content can be updated without
// touching UI code. Plain strings only - they're searched as text.
//
// Each article: { q, a, steps?, link?: { href, label }, plan? }
//   steps - short numbered instructions shown under the answer
//   plan  - "plus" | "enterprise" when only that plan has the feature
//
// Keep answers short and in plain words. Name buttons and pages exactly as
// they appear in the dashboard.

export const SUPPORT_EMAIL = "support@ozmictech.com";
// wa.me needs the international number (country code, no leading 0).
export const SUPPORT_WHATSAPP = "09153374542".replace(/^0/, "234");

// "Start here" - the five things every new store needs, in order.
export const START_STEPS = [
  {
    title: "Confirm your email",
    text: "Open the email we sent when you signed up and tap the link. You can't sign in until you do.",
  },
  {
    title: "Verify your identity",
    text: "Enter your 11-digit NIN. You can set up everything else while it's reviewed, but customers can't see your store until it's approved.",
    link: { href: "/vendor/verification", label: "Go to Verification" },
  },
  {
    title: "Link your bank account",
    text: "This is where your money is paid. Customers can't pay online until it's linked.",
    link: { href: "/vendor/payouts", label: "Go to Payouts" },
  },
  {
    title: "Add your first product",
    text: "A name, a price and a photo is enough to start.",
    link: { href: "/vendor/products/new", label: "Add a product" },
  },
  {
    title: "Share your link",
    text: "Your store link and QR code are on your dashboard once you're verified. Post it on WhatsApp, Instagram, anywhere.",
    link: { href: "/vendor/dashboard", label: "Go to Dashboard" },
  },
];

export const HELP_TOPICS = [
  {
    id: "products",
    title: "Products",
    icon: "Package",
    summary: "Adding, editing, stock and variants",
    articles: [
      {
        q: "How do I add a product?",
        a: "Give it a name and a price, add photos, and set how many you have in stock. Everything else is optional.",
        steps: ["Open Products", "Tap Add product", "Fill in name, price, photos and stock", "Tap Create product"],
        link: { href: "/vendor/products/new", label: "Add a product" },
      },
      {
        q: "The form has too many fields",
        a: "Tap Customize fields at the top of the form and untick what you don't use. Your choice is remembered.",
      },
      {
        q: "How many photos can I add?",
        a: "Up to 10 photos and videos in total. Photos up to 10MB each, one video up to 50MB / 60 seconds. The first photo is the cover on your website.",
      },
      {
        q: "Sizes, colours and other options (variants)",
        a: "Variants let a customer pick an option like Size M or Colour Red, each with its own price and stock. Add them on the product's Edit page.",
        steps: ["Open the product and tap Edit", "Type an option name (Size) and its values (S, M, L)", "Tap Generate variants", "Tap the pencil on a variant to set its price and stock"],
      },
      {
        q: "Putting a product on discount",
        a: "Set Discount % on the product. The customer is charged the lower price and sees the old price crossed out.",
      },
      {
        q: "Selling in bulk at a lower price",
        a: "Use Wholesale / bundle pricing on the product, e.g. ₦900 each when someone buys 10 or more. It's applied automatically at checkout.",
      },
      {
        q: "Products I price for each customer",
        a: "Set Selling method to Request invoice. Customers ask for a price instead of paying straight away, and you reply with an invoice. See Invoices & quotes.",
      },
      {
        q: "Hiding a product without deleting it",
        a: "Set it to Hidden. It disappears from your website but stays saved. A product that has ever been ordered can't be deleted - hide it instead.",
      },
      {
        q: "Low and out-of-stock items",
        a: "Your product list marks low stock in amber and zero stock in red. Your dashboard shows the count too, and you get a notification when something runs low.",
      },
      {
        q: "Adding many products at once",
        a: "On the Products page use Import products from a CSV. Download the template - only name and price are needed. Add photos afterwards by editing each product.",
      },
      {
        q: "Categories",
        a: "Categories group your products and power the filter on your website. Manage them on the Categories page; deleting one never deletes its products.",
        link: { href: "/vendor/categories", label: "Go to Categories" },
      },
      {
        q: "Size guide",
        a: "On the product's Edit page add a size guide table. Customers see a Size guide link, and the measurements for the size they pick.",
      },
    ],
  },
  {
    id: "orders",
    title: "Orders",
    icon: "ShoppingBag",
    summary: "New orders, delivery status and refunds",
    articles: [
      {
        q: "Do I need to accept new orders?",
        a: "No. Paid orders appear in Orders automatically and you get a notification.",
        link: { href: "/vendor/orders", label: "Go to Orders" },
      },
      {
        q: "Updating an order's status",
        a: "Open the order and move it along: processing, then shipped, then delivered. The customer can see the status. There's a PDF button for a receipt or waybill.",
      },
      {
        q: "It says enter the delivery fee first",
        a: "Your delivery fee is set to \"to be determined\", so the customer didn't pay delivery at checkout. Enter what delivery actually cost on the order - it's for your records - then you can update the status.",
      },
      {
        q: "Recording a sale made in person or on WhatsApp",
        a: "Use Record a sale on the Orders page. Add the items, pick how the customer paid, and it's saved to your orders with stock taken off.",
        plan: "plus",
        link: { href: "/vendor/orders/new", label: "Record a sale" },
      },
      {
        q: "What does \"Abandoned\" mean?",
        a: "The customer started checkout but never paid. These clear themselves and any stock held for them is put back.",
      },
      {
        q: "A customer asked for a refund",
        a: "The request shows on their order for you to approve or reject (you must give a reason to reject). Approving doesn't move money - send the refund yourself by transfer, then approve it. The processing fee isn't returned.",
      },
    ],
  },
  {
    id: "invoices",
    title: "Invoices & quotes",
    icon: "FileText",
    summary: "Send a price, get paid by link",
    articles: [
      {
        q: "Sending an invoice to a customer",
        a: "Create an offline quote, set the prices, and send it. The customer gets a link to pay online.",
        steps: ["Open Invoices and tap New offline quote", "Add the items and the customer's name, email and phone", "Open it under Quote requests and type the prices", "Tap Create invoice and copy link, then send the link to the customer"],
        link: { href: "/vendor/invoices", label: "Go to Invoices" },
      },
      {
        q: "Invoicing something that isn't in my products",
        a: "On a line in the offline quote, switch to Custom item and type its name. It doesn't need to be added to your products and no stock is tracked for it.",
      },
      {
        q: "Customers asking for a price",
        a: "Products set to Request invoice show a Request a quote button on your website. Their requests land in Quote requests - type your prices and send the invoice.",
        link: { href: "/vendor/invoices/requests", label: "Go to Quote requests" },
      },
      {
        q: "Letting a customer pay part now",
        a: "When setting prices, choose Part now, rest later and pick how much they pay first (e.g. 30% or 50%). They pay that first, then the rest from the same link.",
      },
      {
        q: "When does an invoice expire?",
        a: "After 7 days if unpaid. Any stock held for it is put back, and you can cancel an invoice yourself at any time.",
      },
    ],
  },
  {
    id: "payments",
    title: "Payments & payouts",
    icon: "Wallet",
    summary: "When you get paid and what it costs",
    articles: [
      {
        q: "When do I get my money?",
        a: "Online payments are paid into your linked bank account the next business day (weekend payments arrive Monday). The Payouts page shows each one.",
        link: { href: "/vendor/payouts", label: "Go to Payouts" },
      },
      {
        q: "What is the processing fee?",
        a: "Each online payment has one fee: a small percentage plus a flat amount, shown on the order. It covers card and bank processing. Sales you record yourself have no fee.",
      },
      {
        q: "Can the customer pay the fee instead of me?",
        a: "Yes. In Store settings, under Fees, choose whether the fee comes out of your money or is added to what the customer pays.",
        link: { href: "/vendor/settings", label: "Go to Store settings" },
      },
      {
        q: "Changing my bank account",
        a: "Your bank account is locked once linked, for your safety. Contact support to change it.",
      },
    ],
  },
  {
    id: "delivery",
    title: "Delivery",
    icon: "Truck",
    summary: "Delivery fees and where you deliver",
    articles: [
      {
        q: "Setting a delivery fee",
        a: "On the Shipping page choose Fixed fee for every order, or Agree after order if you settle the cost with each customer once they order.",
        link: { href: "/vendor/shipping", label: "Go to Shipping" },
      },
      {
        q: "Different fees for different places",
        a: "Under Fees for specific places, tap Add a fee for a place and pick a state, or a city/LGA in it. The most specific one is used: a city fee beats a state fee, which beats your main delivery fee.",
      },
      {
        q: "Only delivering to some states",
        a: "Under Where you deliver in Nigeria, choose Only some states and tick them. Customers elsewhere are told you don't deliver there before they pay.",
      },
      {
        q: "Delivering outside Nigeria",
        a: "Under Outside Nigeria on the Shipping page, turn on Deliver to other countries, choose the countries and set a fee for abroad. You can add a fee per country too. See Selling abroad.",
      },
    ],
  },
  {
    id: "website",
    title: "Your website",
    icon: "Store",
    summary: "Your link, look and store status",
    articles: [
      {
        q: "Where is my website link?",
        a: "On your dashboard, with a QR code you can print for your shop or flyers. It appears once your identity is verified.",
        link: { href: "/vendor/dashboard", label: "Go to Dashboard" },
      },
      {
        q: "Adding my logo and WhatsApp number",
        a: "In Store settings add your logo, a short description and your WhatsApp number. WhatsApp powers the chat button customers see on your website.",
        link: { href: "/vendor/settings", label: "Go to Store settings" },
      },
      {
        q: "Closing my store for a while",
        a: "In Store settings turn off Store status. Customers see a closed page; your link keeps working and nothing is deleted.",
      },
      {
        q: "The Storezn marketplace",
        a: "Your products also appear in the Storezn marketplace so new customers can find you. Turn it off in Store settings - your own website isn't affected.",
      },
      {
        q: "My own colour and domain name",
        a: "Storezn+ lets you pick your website's colour and use your own address like shop.yourbrand.com. It also removes the Storezn link from your website footer.",
        plan: "plus",
        link: { href: "/vendor/plus", label: "See Storezn+" },
      },
    ],
  },
  {
    id: "abroad",
    title: "Selling abroad",
    icon: "Globe",
    summary: "Dollar prices, foreign cards, delivery abroad",
    articles: [
      {
        q: "Accepting payments from outside Nigeria",
        a: "Turn on Accept international payments in Store settings. Your website opens in dollars and customers with foreign cards can pay by card or Apple Pay.",
        link: { href: "/vendor/settings", label: "Go to Store settings" },
      },
      {
        q: "Do I set prices in dollars?",
        a: "No. You always set prices in naira and are always paid in naira. Dollar prices are shown to customers using the current market rate, as a guide.",
      },
      {
        q: "Is the fee different for foreign cards?",
        a: "Yes. Foreign cards cost more to process, so a higher processing fee applies when a customer pays with one. Your Store settings shows both fees.",
      },
      {
        q: "Delivering to other countries",
        a: "On the Shipping page, under Outside Nigeria, turn on Deliver to other countries. Choose which countries, a fee for abroad, and optional fees per country.",
        link: { href: "/vendor/shipping", label: "Go to Shipping" },
      },
    ],
  },
  {
    id: "team",
    title: "Staff & branches",
    icon: "Users",
    summary: "People who help you, more locations",
    articles: [
      {
        q: "Adding a staff member",
        a: "On the Staff page invite them by email. They set their own password and get a simpler dashboard.",
        link: { href: "/vendor/staff", label: "Go to Staff" },
      },
      {
        q: "What can staff see?",
        a: "Products, categories, orders, invoices, customers and store settings. They can't see payouts, verification, plans or the staff list.",
      },
      {
        q: "How many staff can I have?",
        a: "One on the free plan, more with Storezn+ and Enterprise.",
      },
      {
        q: "Selling from more than one location",
        a: "Add branches, and each one keeps its own stock. Online orders are sent from the first branch that has everything in stock.",
        plan: "plus",
        link: { href: "/vendor/branches", label: "Go to Branches" },
      },
      {
        q: "Seeing who changed what",
        a: "The Activity log lists changes made by you and your staff, like price changes and renamed products.",
        link: { href: "/vendor/activity", label: "Go to Activity log" },
      },
    ],
  },
  {
    id: "pos",
    title: "Shop till (POS)",
    icon: "Calculator",
    summary: "Selling in your shop, cash drawer, safe",
    articles: [
      {
        q: "Selling in my shop",
        a: "Open Sell (POS), add items by search or barcode, and take payment by cash, transfer or POS machine. Stock comes off immediately.",
        plan: "enterprise",
        link: { href: "/vendor/pos", label: "Go to Sell (POS)" },
      },
      {
        q: "Opening and closing the till",
        a: "Each shift opens by counting the cash in the drawer, and closes by counting the notes, ₦1,000 down to ₦5. The count is recorded as it is.",
        plan: "enterprise",
      },
      {
        q: "Why is a shift flagged?",
        a: "A shift is flagged when the drawer wasn't counted at close, or a sale made offline synced late. The flag says why; you review and clear it.",
        plan: "enterprise",
        link: { href: "/vendor/pos/registers", label: "Go to Registers" },
      },
      {
        q: "Selling when the internet is down",
        a: "The till keeps working offline and saves sales on the device. They upload by themselves when the connection is back - don't clear the browser meanwhile.",
        plan: "enterprise",
      },
      {
        q: "The safe and monthly report",
        a: "The Safe records cash moved out of drawers. The Monthly report sums up sales, payments and cash for the month.",
        plan: "enterprise",
      },
    ],
  },
  {
    id: "plans",
    title: "Plans",
    icon: "Sparkles",
    summary: "Free, Storezn+ and Enterprise",
    articles: [
      {
        q: "What does Storezn+ add?",
        a: "Recording sales you make yourself, your own website colour and domain name, no Storezn link on your website, more staff, more branches and more storage.",
        link: { href: "/vendor/plus", label: "See Storezn+" },
      },
      {
        q: "What does Enterprise add?",
        a: "Everything in Storezn+ plus the shop till (POS), registers and shifts, the safe and the monthly report. Contact support to get it.",
      },
      {
        q: "Paying and cancelling",
        a: "Storezn+ is charged monthly by card. Cancel any time on the Storezn Plus page - you keep it until the end of the month you paid for.",
      },
    ],
  },
  {
    id: "account",
    title: "Account & app",
    icon: "User",
    summary: "Password, notifications, install the app",
    articles: [
      {
        q: "Changing my password or details",
        a: "On your Profile page you can change your password, name and phone number.",
        link: { href: "/profile", label: "Go to Profile" },
      },
      {
        q: "Getting notified of new orders",
        a: "Turn on notifications in Store settings, once on each phone or computer you want alerts on. You're told about new orders and low stock.",
      },
      {
        q: "Installing Storezn on my phone",
        a: "On Android tap Install when the banner appears. On iPhone tap Share, then Add to Home Screen.",
      },
      {
        q: "Closing my account",
        a: "Profile, then Disable account. Your website goes offline but nothing is deleted. Contact support to reopen it or delete everything.",
      },
    ],
  },
  {
    id: "trouble",
    title: "Something's not working",
    icon: "LifeBuoy",
    summary: "Quick fixes for common problems",
    articles: [
      {
        q: "Customers can't pay",
        a: "Check three things: your identity is verified, your bank account is linked, and Store status is on in Store settings.",
      },
      {
        q: "My website link shows nothing",
        a: "Your identity verification is still being reviewed or was rejected. Check the Verification page.",
        link: { href: "/vendor/verification", label: "Go to Verification" },
      },
      {
        q: "A customer can't add an item to cart",
        a: "Usually a product with two kinds of options (e.g. Size and Colour) is missing some combinations. Edit it and tap Generate variants.",
      },
      {
        q: "I can't delete a product",
        a: "It has been ordered before, and deleting it would break those order records. Set it to Hidden instead.",
      },
      {
        q: "I forgot my password",
        a: "On the sign-in page tap Forgot password and follow the link we email you.",
      },
      {
        q: "I didn't get the confirmation email",
        a: "Check your spam folder. Still nothing? Use the resend option on the sign-in page, or message us.",
      },
      {
        q: "A page won't load or says Unauthorized",
        a: "Refresh once. If it keeps happening, sign out and back in, or message us.",
      },
    ],
  },
];

// Shown on the Help home before anything is searched.
export const POPULAR_QUESTIONS = [
  ["payments", "When do I get my money?"],
  ["trouble", "Customers can't pay"],
  ["invoices", "Sending an invoice to a customer"],
  ["delivery", "Setting a delivery fee"],
  ["products", "The form has too many fields"],
];

const norm = (text) => String(text || "").toLowerCase();

// Every article whose question, answer or steps contain each word typed.
export function searchHelp(query) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const results = [];
  for (const topic of HELP_TOPICS) {
    for (const article of topic.articles) {
      const haystack = norm([topic.title, article.q, article.a, ...(article.steps || [])].join(" "));
      if (words.every((word) => haystack.includes(word))) results.push({ topic, article });
    }
  }
  return results;
}

export function findArticle(topicId, question) {
  const topic = HELP_TOPICS.find((t) => t.id === topicId);
  const article = topic?.articles.find((a) => a.q === question);
  return topic && article ? { topic, article } : null;
}
