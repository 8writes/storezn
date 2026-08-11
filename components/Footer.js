import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-brand-900 text-white mt-10">
      <div className="border-t border-slate-800 py-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-white">
          <p>
            &copy; {new Date().getFullYear()} Storezn. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link href="/help" className="hover:underline">
              Vendor guide
            </Link>
            <a
              href="https://ozmictech.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Powered by Ozmictech
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
