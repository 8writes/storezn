"use client";
// Which sidebar groups the vendor has opened, remembered per browser.
//
// Same external-store shape as lib/navCollapse.js (and for the same
// reason): read on mount and changed from more than one place, so the
// layout subscribes with useSyncExternalStore rather than copying it into
// state from an effect, which would render every group in the wrong state
// for one frame.
//
// Groups start closed apart from the role's primary one (see
// DEFAULT_OPEN). The vendor nav is 20 links across 6 groups, which is a
// wall of text to scan every time you want one page. The group holding
// the current page is also always forced open by the layout, so the
// sidebar still shows you where you are without anyone having to click -
// that is derived at render time and deliberately not stored here.
export const NAV_GROUPS_KEY = "nav_open_groups";
export const NAV_GROUPS_EVENT = "storezn:navgroups";

// Open on a browser that has never chosen for itself: the primary group
// of each role's nav (vendor "Store", super-admin "Overview", staff
// "Work"). Only that group - the rest stay closed, which is the whole
// point - but landing in a sidebar where every group is shut hides the
// pages people actually use daily. Once someone toggles anything, their
// stored list wins outright, including closing this one.
//
// Frozen and shared for the identity reason described below.
const DEFAULT_OPEN = Object.freeze(["Store", "Overview", "Work"]);
const EMPTY = Object.freeze([]);

// useSyncExternalStore compares snapshots by identity, so this must hand
// back the SAME array until the stored value actually changes - parsing
// into a fresh array on every call is an infinite render loop, not just a
// wasted allocation.
let cachedRaw;
let cachedValue = DEFAULT_OPEN;

export function readOpenNavGroups() {
  try {
    const raw = localStorage.getItem(NAV_GROUPS_KEY);
    if (raw === cachedRaw) return cachedValue;
    cachedRaw = raw;
    // null = never toggled anything, so take the default. An explicit
    // "[]" is a choice (everything closed) and is honoured as one.
    if (raw === null) {
      cachedValue = DEFAULT_OPEN;
      return cachedValue;
    }
    const parsed = JSON.parse(raw);
    cachedValue = Array.isArray(parsed) ? parsed.filter((title) => typeof title === "string") : EMPTY;
    return cachedValue;
  } catch {
    // private mode / blocked storage / corrupt value - behave like a
    // fresh browser rather than collapsing everything.
    return DEFAULT_OPEN;
  }
}

export function toggleNavGroup(title) {
  const open = new Set(readOpenNavGroups());
  if (open.has(title)) open.delete(title);
  else open.add(title);
  const next = [...open];
  try {
    localStorage.setItem(NAV_GROUPS_KEY, JSON.stringify(next));
  } catch {
    /* ignore - the toggle still applies for this render via the event */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NAV_GROUPS_EVENT));
  return next;
}

export function subscribeToNavGroups(onChange) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(NAV_GROUPS_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(NAV_GROUPS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// Matches what a browser with no stored preference renders, so the
// server pass and hydration agree.
export function getServerOpenNavGroups() {
  return DEFAULT_OPEN;
}
