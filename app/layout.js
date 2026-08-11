import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import RegisterServiceWorker from "./RegisterServiceWorker.js";
import InstallPrompt from "./InstallPrompt.js";
import ScrollToTop from "./ScrollToTop.js";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata = {
  title: "Storezn",
  description: "E-commerce platform, get your own dedicated store.",
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
    <html lang="en" className={`h-full overflow-x-clip ${jakarta.variable}`}>
      {/* `clip`, not `hidden`: any non-"visible" overflow-x forces
          overflow-y's computed value to "auto" too, turning html/body
          into a scroll container and breaking every `position: sticky`
          descendant (the dashboard sidebar uses it). `clip` prevents
          runaway-width content from creating page-level horizontal
          scroll on mobile without that side effect. */}
      <body className="min-h-full overflow-x-clip bg-slate-50 text-slate-900 antialiased">
        <RegisterServiceWorker />
        <InstallPrompt />
        <ScrollToTop />
        {children}
      </body>
    </html>
  );
}
