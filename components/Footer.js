
export function Footer() {
  return (
    <footer className="bg-brand-900 text-white mt-10">
      <div className="border-t border-slate-800 py-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-white">
          <p>
            &copy; {new Date().getFullYear()} Storezn. All rights reserved.
          </p>
          <p>
            <a
              href="https://ozmictech.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Powered by Ozmictech
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
