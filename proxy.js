import { NextResponse } from "next/server";
import { isMaintenanceModeOn } from "./lib/maintenanceMode.js";
import { maintenancePageHtml } from "./lib/maintenancePage.js";

// Paths that are never a store's storefront, on ANY host - the API
// resolves its own store from the raw Host header itself (see every
// route that calls lib/resolveStore.js directly), so rewriting its path
// too would be redundant at best and break the route matching at worst.
// (_next/static, _next/image, and favicon.ico are excluded via the
// matcher below instead, since those are asset requests, not pages.)
const NEVER_REWRITE_PREFIXES = ["/api"];

// Kept reachable during maintenance mode: webhooks (a Paystack payment
// must not go unrecorded just because the site is down), cron endpoints
// (scheduled jobs shouldn't stop firing), and auth/super-admin (so the
// admin can still sign in and flip maintenance back off).
const MAINTENANCE_EXEMPT_API_PREFIXES = ["/api/v1/webhooks", "/api/cron", "/api/v1/super-admin", "/api/v1/auth/login", "/api/v1/auth/me"];
// Same idea for page paths, but only meaningful on the platform's own
// host - see the no-special-casing note below for why this can't extend
// to a store's own /login on its subdomain.
const MAINTENANCE_EXEMPT_PLATFORM_PATHS = ["/login", "/super-admin"];

// Runs on every request (Next 16 renamed "middleware" to "proxy" - see
// node_modules/next/dist/docs/.../file-conventions/proxy.md). Kept to
// pure hostname/string logic; the actual "which store is this?" DB
// lookup happens in app/storefront/[host]/... via lib/resolveStore.js.
//
// Deliberately does NOT special-case platform paths like /login,
// /signup, /vendor, /super-admin - those only mean "the platform's own
// page" on the platform's own root host. A store subdomain hitting
// /login must reach that store's own customer login
// (app/storefront/[host]/login), not the vendor/admin one - carving out
// a blanket path exemption here would make every store's own /login,
// /signup etc permanently unreachable.
export async function proxy(req) {
  const url = req.nextUrl;
  const isApiPath = NEVER_REWRITE_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`));

  const host = (req.headers.get("host") || "").split(":")[0];
  const rootDomain = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost").split(":")[0];
  const isPlatformHost = host === rootDomain || host === `www.${rootDomain}`;

  const isExempt = isApiPath
    ? MAINTENANCE_EXEMPT_API_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))
    : isPlatformHost && MAINTENANCE_EXEMPT_PLATFORM_PATHS.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`));

  if (!isExempt && (await isMaintenanceModeOn())) {
    if (isApiPath) {
      return NextResponse.json({ error: "Down for maintenance, please try again shortly" }, { status: 503 });
    }
    return new NextResponse(maintenancePageHtml(), { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
  }

  if (isApiPath) {
    return NextResponse.next();
  }

  if (isPlatformHost) {
    return NextResponse.next();
  }

  // Any other host is either a <slug>.<rootDomain> subdomain or a fully
  // custom domain - either way, rewrite into the storefront route group,
  // keyed by the raw host string, and let the page resolve it.
  url.pathname = `/storefront/${host}${url.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
