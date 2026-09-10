import Image from "next/image";
import Link from "next/link";
import { Toaster } from "sonner";
import { ThemeToggle } from "@/components/ui/ThemeToggle.js";
import { PlatformThemeSync } from "@/components/PlatformThemeSync.js";

export default function AuthLayout({ children }) {
  return (
    <div className="font-ui min-h-screen flex">
      <PlatformThemeSync />
      <Toaster position="top-right" offset="10vh" closeButton={true} />

      <div className="hidden md:flex md:w-1/2 lg:w-2/5 flex-col justify-between bg-linear-to-br from-neutral-900 to-brand-900 text-white p-10">
        <Link href="/" className="flex items-center">
          <Image src="/storezn-logo.png" alt="Storezn" width={140} height={34} priority unoptimized />
        </Link>

        <div className="space-y-3 max-w-sm">
          <h1 className="text-3xl font-bold leading-tight">
            Easy Business Management
          </h1>
        </div>

        <p className="text-xs text-white/60">&copy; {new Date().getFullYear()} Storezn.</p>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="md:hidden flex items-center px-4 h-16 bg-brand-900 text-white">
          <Image src="/storezn-logo.png" alt="Storezn" width={120} height={29} priority unoptimized />
        </div>

        <div className="flex justify-end px-4 pt-3">
          <div className="w-40">
            <ThemeToggle />
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-4 pt-6 pb-10 bg-surface">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
    </div>
  );
}
