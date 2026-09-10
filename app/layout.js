import { Plus_Jakarta_Sans, Inter } from "next/font/google";
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

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`h-full overflow-x-clip ${jakarta.variable} ${inter.variable}`}>
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
