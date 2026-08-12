import { Store } from "lucide-react";
import { getPlatformUrl } from "@/lib/storeUrl.js";

export default function StorefrontNotFound() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 text-center">
      <div className="max-w-md space-y-4">
        <span className="flex items-center justify-center h-14 w-14 rounded-full bg-slate-100 text-slate-700 mx-auto">
          <Store size={26} />
        </span>
        <h1 className="text-xl font-bold text-slate-900">Store not found</h1>
        <p className="text-sm text-slate-500">
          We couldn&apos;t find a store at this address. Double check the link - it may be mistyped, or the store may no longer exist.
        </p>
        <a
          href={getPlatformUrl("/")}
          className="inline-block text-sm font-semibold text-slate-900 underline underline-offset-4"
        >
          Go to Storezn
        </a>
      </div>
    </div>
  );
}
