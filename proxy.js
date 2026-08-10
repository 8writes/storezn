import { NextResponse } from "next/server";

// Paths that are never a store's storefront, on ANY host - the API
// resolves its own store from the raw Host header itself (see every
// route that calls lib/resolveStore.js directly), so rewriting its path
// too would be redundant at best and break the route matching at worst.
// (_next/static, _next/image, and favicon.ico are excluded via the
// matcher below instead, since those are asset requests, not pages.)
const NEVER_REWRITE_PREFIXES = ["/api"];

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
export function proxy(req) {
  const url = req.nextUrl;
  if (NEVER_REWRITE_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const host = (req.headers.get("host") || "").split(":")[0];
  const rootDomain = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost").split(":")[0];
  const isPlatformHost = host === rootDomain || host === `www.${rootDomain}`;

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
