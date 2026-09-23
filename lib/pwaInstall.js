"use client";

import { useSyncExternalStore } from "react";

const SERVER_SNAPSHOT = {
  deferredPrompt: null,
  ready: false,
  isIos: false,
  isPlatformHost: false,
  standalone: false,
  dismissed: true,
};

let state = SERVER_SNAPSHOT;
const listeners = new Set();

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

if (typeof window !== "undefined") {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  const rootDomain = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost").split(":")[0];
  const isPlatformHost = window.location.hostname === rootDomain;

  state = {
    deferredPrompt: null,
    ready: true,
    isIos,
    isPlatformHost,
    standalone,
    dismissed: !isPlatformHost || standalone,
  };

  window.addEventListener("beforeinstallprompt", (event) => {
    // The browser's own mini-infobar would use the platform manifest on a
    // storefront host, so only retain the event on Storezn's platform host.
    event.preventDefault();
    if (isPlatformHost) {
      setState({ deferredPrompt: event, dismissed: false, standalone: false });
    }
  });

  window.addEventListener("appinstalled", () => {
    setState({ deferredPrompt: null, standalone: true, dismissed: true });
  });
}

export function usePwaInstall() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function dismissPwaInstall() {
  // Keep dismissal in memory only, so uninstalling the app can surface the
  // install option again after the next browser install event.
  setState({ dismissed: true });
}

export async function installPwa() {
  const { deferredPrompt } = state;
  if (!deferredPrompt) return;

  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  setState({
    deferredPrompt: null,
    dismissed: choice?.outcome === "accepted",
  });
}
