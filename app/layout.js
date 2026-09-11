import { Plus_Jakarta_Sans, Inter, Sora } from "next/font/google";
import "./globals.css";
import RegisterServiceWorker from "./RegisterServiceWorker.js";
import InstallPrompt from "./InstallPrompt.js";
import ScrollToTop from "./ScrollToTop.js";

// Jakarta stays the default (storefront / marketing pages - warmer,
// display-ish). The platform (dashboard, admin, auth) opts into Inter
// via `.font-ui` - a neutral workhorse that holds up at small sizes and
// has proper tabular figures for all the money / quantity tables.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Display face for the public marketing pages only (landing / pricing),
// opted into with `.font-display` - a tight geometric grotesque that
// reads as considered and official at large sizes. Not loaded on the
// dashboard or storefront, which keep Inter / Jakarta.
const sora = Sora({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

export const metadata = {
  title: "Storezn | Business management & e-commerce platform",
  description: "E-commerce platform, get your own dedicated store and easily manage your inventory, sales and business operations.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Storezn",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#14915b",
};

// Runs synchronously while the browser parses <head>, before first
// paint: on the signed-in vendor / admin dashboard it sets the saved
// theme (default dark); auth pages, the storefront and every marketing
// page stay light. Keep the path list in sync with lib/theme.js
// PLATFORM_RE.
const THEME_BOOTSTRAP = `(function(){try{
if(!/^\\/(vendor|super-admin|dashboard|profile)(\\/|$)/.test(location.pathname))return;
var t;try{t=localStorage.getItem("storezn_theme")}catch(e){}
document.documentElement.setAttribute("data-theme",t==="light"?"light":"dark");
}catch(e){}})()`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning className={`h-full overflow-x-clip ${jakarta.variable} ${inter.variable} ${sora.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      {/* `clip`, not `hidden`: any non-"visible" overflow-x forces
          overflow-y's computed value to "auto" too, turning html/body
          into a scroll container and breaking every `position: sticky`
          descendant (the dashboard sidebar uses it). `clip` prevents
          runaway-width content from creating page-level horizontal
          scroll on mobile without that side effect. */}
      <body className="min-h-full overflow-x-clip bg-canvas text-slate-900 antialiased">
        <RegisterServiceWorker />
        <InstallPrompt />
        <ScrollToTop />
        {children}
      </body>
    </html>
  );
}
