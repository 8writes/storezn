"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WifiOff } from "lucide-react";
import { isOffline, onConnectivityChange } from "@/lib/connectivity.js";

// Tells a cashier what still works while the device is offline, without
// moving them. This used to router.replace() them onto /vendor/pos the
// moment the connection dropped, which yanked the page out from under
// anyone mid-task - including someone who had only glanced at the
// register earlier in the session - and lost whatever they were part-way
// through typing. The register is offered as a link instead; the nav
// itself is already disabled while offline (see navOffline in
// app/(dashboard)/layout.js), so nothing here needs to police navigation.
const POS_PREFIX = "/vendor/pos";
const SESSION_FLAG = "pos_session_active";

const isPosPath = (p) => p === POS_PREFIX || p.startsWith(`${POS_PREFIX}/`);

export function OfflineNavGuard() {
  const pathname = usePathname();
  const [offline, setOffline] = useState(false);
  const [active, setActive] = useState(false);

  // "active" = this tab has been on the register at least once. Set on
  // arrival, then sticky for the tab session.
  useEffect(() => {
    let a = false;
    try {
      if (isPosPath(pathname)) {
        sessionStorage.setItem(SESSION_FLAG, "1");
        a = true;
      } else {
        a = sessionStorage.getItem(SESSION_FLAG) === "1";
      }
    } catch {
      /* private mode / storage blocked - guard just stays off */
    }
    Promise.resolve().then(() => setActive(a));
  }, [pathname]);

  useEffect(() => {
    Promise.resolve().then(() => setOffline(isOffline()));
    return onConnectivityChange(setOffline);
  }, []);

  if (!offline || !active) return null;

  const onRegister = isPosPath(pathname);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 bg-amber-500 px-3 py-1.5 text-center text-xs font-medium text-white">
      <WifiOff size={13} className="shrink-0" />
      {onRegister ? (
        <span>
          Offline - register only. Saved catalogue search and sales work; navigation,
          live stock updates, cash movements, register closing, and sync wait for
          the connection to return.
        </span>
      ) : (
        <>
          <span>You&apos;re offline. This page needs a connection, but the register keeps selling.</span>
          <Link href={POS_PREFIX} className="shrink-0 underline underline-offset-2 hover:no-underline">
            Open register
          </Link>
        </>
      )}
    </div>
  );
}
