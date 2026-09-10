"use client";
// Ends the signed-in session on the client, right now: clears the stored
// token/user and hard-navigates. Used when the server says the session
// is dead (401) or the account / device is banned (403 + banned) - so a
// ban takes effect mid-page, not just at the next login. A full-page nav
// (not router.push) guarantees every in-memory bit of the old session is
// gone.
let firing = false;

export function killSession(to = "/login", reason) {
  if (typeof window === "undefined" || firing) return;
  firing = true;
  try {
    localStorage.removeItem("ecom_token");
    localStorage.removeItem("ecom_user");
  } catch {
    /* private mode */
  }
  const here = window.location.pathname;
  if (here === to || here === "/login" || here === "/banned") return; // already there / on an auth page
  const url = reason && to === "/banned" ? `${to}?reason=${encodeURIComponent(reason)}` : to;
  window.location.replace(url);
}
