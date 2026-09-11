// Shown in place of a login/signup form when the account or device is
// barred. Self-contained (no internal links) so it renders correctly on
// the platform host AND on a store's own subdomain, where a link to
// /terms would hit the storefront rewrite.
export function BannedNotice({ reason }) {
  return (
    <div className="max-w-md mx-auto py-10 space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Your access has been restricted</h1>
      <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
        <p>
          This account or device has been suspended for activity that breaks the Storezn Terms of Service, such as
          creating accounts in bulk, scraping data, sharing access, or attempting to copy or reverse-engineer the
          platform.
        </p>
        {reason && (
          <p className="bg-slate-50 border border-slate-200 rounded-sm px-3 py-2 text-slate-600">
            <span className="font-medium text-slate-700">Reason:</span> {reason}
          </p>
        )}
        <p className="border-t border-slate-100 pt-3">
          To appeal, email{" "}
          <a href="mailto:support@ozmictech.com?subject=Account%20appeal" className="text-brand-600 hover:underline font-medium">
            support@ozmictech.com
          </a>{" "}
          from the account&apos;s email address and tell us what happened. We usually respond within a few business days.
        </p>
      </div>
    </div>
  );
}
