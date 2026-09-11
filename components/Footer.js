import Link from "next/link";
import Image from "next/image";

const PRODUCT_LINKS = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/pricing", label: "Pricing" },
  { href: "/help", label: "Vendor guide" },
  { href: "/login", label: "Log in" },
];

const COMPANY_LINKS = [
  { href: "mailto:support@ozmictech.com", label: "Contact us" },
  { href: "/terms", label: "Terms of service" },
  { href: "/privacy", label: "Privacy policy" },
  { href: "https://ozmictech.com/", label: "Ozmictech", external: true },
];

function FooterColumn({ title, links }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-white/40">{title}</p>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.label}>
            {l.external ? (
              <a href={l.href} target="_blank" rel="noopener noreferrer" className="text-sm text-white/70 hover:text-white transition-colors">
                {l.label}
              </a>
            ) : (
              <Link href={l.href} className="text-sm text-white/70 hover:text-white transition-colors">
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="bg-brand-900 text-white mt-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-16 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-10">
        <div className="col-span-2 sm:col-span-1 sm:pr-6">
          <Image src="/storezn-logo.png" alt="Storezn" width={120} height={29} unoptimized className="h-6 w-auto" />
          <p className="mt-3 text-sm text-white/50 max-w-55 leading-relaxed">
            Your store, your till, and your payouts, all from one dashboard.
          </p>
        </div>
        <FooterColumn title="Product" links={PRODUCT_LINKS} />
        <FooterColumn title="Company" links={COMPANY_LINKS} />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-white/40">Get started</p>
          <p className="mt-4 text-sm text-white/70 leading-relaxed">
            Free to create. No card required.
          </p>
          <Link
            href="/signup"
            className="mt-3 inline-flex items-center justify-center text-sm font-semibold bg-white text-brand-900 px-4 py-2 rounded-sm hover:bg-brand-50 transition-colors"
          >
            Create your store
          </Link>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/50">
          <p>&copy; {new Date().getFullYear()} Storezn. All rights reserved.</p>
          <a href="https://ozmictech.com/" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
            Powered by Ozmictech
          </a>
        </div>
      </div>
    </footer>
  );
}
