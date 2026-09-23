"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { WifiOff } from "lucide-react";
import { isOffline, onConnectivityChange } from "@/lib/connectivity.js";

// While the device is offline, keep a cashier on the register. Every
// other dashboard page needs the network to load anything, and the whole
// point of the POS is that it keeps working offline (IndexedDB sale
// queue + catalogue snapshot, see lib/posOffline.js). Once /vendor/pos
// has been opened in this tab, going offline anywhere else bounces
// straight back so the shift never stalls on a blank screen. Someone who
// never opened the register this session is left alone.
const POS_PREFIX = "/vendor/pos";
const SESSION_FLAG = "pos_session_active";

const isPosPath = (p) => p === POS_PREFIX || p.startsWith(`${POS_PREFIX}/`);

export function OfflineNavGuard() {
  const pathname = usePathname();
  const router = useRouter();
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

  useEffect(() => {
    if (!offline || !active || isPosPath(pathname)) return;
    toast.info("You're offline - staying on the register");
    router.replace(POS_PREFIX);
  }, [offline, active, pathname, router]);

  if (!offline || !active) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-center gap-1.5 bg-amber-500 px-3 py-1.5 text-center text-xs font-medium text-white">
      <WifiOff size={13} className="shrink-0" />
      Offline - register only. Saved catalogue search and sales work; navigation,
      live stock updates, cash movements, register closing, and sync wait for
      the connection to return.
    </div>
  );
}
