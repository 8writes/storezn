"use client";
import { useEffect } from "react";

// Tells the store, once a day, that this browser looked at it.
//
// Only runs when the shopper has accepted analytics cookies. The consent
// banner offers that choice explicitly, so honouring it is not optional -
// a shopper who declines is simply not counted, and the vendor's visitor
// figure is understood to be an undercount rather than being made
// complete by tracking them some other way.
//
// Everything is local and cheap: a random id kept in this browser, plus
// the last day it reported, so a shopper clicking through twenty products
// sends exactly one request.
const CONSENT_KEY = "storezn_cookie_consent_v1";
const VISITOR_KEY = "storezn_visitor_id";
const LAST_SENT_KEY = "storezn_visit_sent_on";

function analyticsAllowed() {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return false; // not answered yet - don't assume a yes
    return Boolean(JSON.parse(raw)?.analytics);
  } catch {
    return false;
  }
}

function visitorId() {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `v_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    // Private mode or blocked storage: no stable id, so no counting.
    return null;
  }
}

export function VisitBeacon() {
  useEffect(() => {
    const report = () => {
      if (!analyticsAllowed()) return;
      const today = new Date().toISOString().slice(0, 10);
      let lastSent = null;
      try {
        lastSent = localStorage.getItem(LAST_SENT_KEY);
      } catch {
        /* unreadable storage - fall through and let the server dedup */
      }
      if (lastSent === today) return;

      const id = visitorId();
      if (!id) return;

      // keepalive so it still goes out if the shopper navigates away
      // immediately; a failure is silently fine - this is a counter, not
      // something the page depends on.
      fetch("/api/v1/storefront/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId: id }),
        keepalive: true,
      })
        .then(() => {
          try {
            localStorage.setItem(LAST_SENT_KEY, today);
          } catch {
            /* ignore - the server's unique index dedups anyway */
          }
        })
        .catch(() => {});
    };

    report();
    // Someone who accepts cookies after landing should start counting
    // from that moment rather than their next visit.
    window.addEventListener("storezn:cookie-consent", report);
    return () => window.removeEventListener("storezn:cookie-consent", report);
  }, []);

  return null;
}
