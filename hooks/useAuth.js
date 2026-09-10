"use client";
import { useReducer, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { deviceHeaders } from "@/lib/clientDevice.js";
import { killSession } from "@/lib/session.js";

const initialState = { user: null, token: null, loading: true };

// How often an open tab re-checks that its session is still valid, so a
// ban / suspension takes an idle session down within a minute rather than
// only on the next action.
const REVALIDATE_MS = 60_000;
// useAuth is mounted by many components at once - only the first claims
// the re-validation loop so the tab makes one /auth/me call per minute,
// not one per consumer.
let revalidationOwned = false;

function authReducer(state, action) {
  switch (action.type) {
    case "LOADED":
      return { ...state, user: action.user, token: action.token, loading: false };
    case "CLEARED":
      return { user: null, token: null, loading: false };
    case "UPDATE_USER":
      return { ...state, user: action.user };
    default:
      return state;
  }
}

export function useAuth(requireAuth = true) {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const router = useRouter();

  useEffect(() => {
    const storedToken = localStorage.getItem("ecom_token");
    const storedUser = localStorage.getItem("ecom_user");

    if (storedToken && storedUser) {
      try {
        dispatch({ type: "LOADED", token: storedToken, user: JSON.parse(storedUser) });
      } catch {
        localStorage.removeItem("ecom_token");
        localStorage.removeItem("ecom_user");
        dispatch({ type: "CLEARED" });
        if (requireAuth) router.replace("/login");
      }
    } else {
      dispatch({ type: "CLEARED" });
      if (requireAuth) router.replace("/login");
    }
  }, [requireAuth, router]);

  // Re-validate the stored session against the server on load, on tab
  // refocus, and on a slow interval. A 401 (dead token / banned account /
  // disabled store) logs out to /login; a 403 {banned} (device ban) goes
  // to /banned. A network blip is ignored - only a real answer acts.
  useEffect(() => {
    if (!requireAuth || revalidationOwned) return;
    const token = localStorage.getItem("ecom_token");
    if (!token) return;
    revalidationOwned = true;

    let stopped = false;
    const check = async () => {
      if (stopped || document.visibilityState === "hidden") return;
      let res;
      try {
        res = await fetch("/api/v1/auth/me", { headers: { ...deviceHeaders(), Authorization: `Bearer ${token}` } });
      } catch {
        return; // offline - don't punish a flaky connection
      }
      if (res.ok) return;
      if (res.status === 401) return killSession("/login");
      if (res.status === 403) {
        const body = await res.json().catch(() => null);
        if (body?.banned) killSession("/banned", body.reason);
      }
    };

    check();
    const iv = setInterval(check, REVALIDATE_MS);
    const onVis = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stopped = true;
      revalidationOwned = false;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [requireAuth]);

  const login = useCallback((newToken, newUser) => {
    localStorage.setItem("ecom_token", newToken);
    localStorage.setItem("ecom_user", JSON.stringify(newUser));
    dispatch({ type: "LOADED", token: newToken, user: newUser });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("ecom_token");
    localStorage.removeItem("ecom_user");
    dispatch({ type: "CLEARED" });
    router.push("/login");
  }, [router]);

  const updateUser = useCallback((updates) => {
    dispatch({
      type: "UPDATE_USER",
      user: (() => {
        const current = JSON.parse(localStorage.getItem("ecom_user") || "null");
        if (!current) return current;
        const updated = { ...current, ...updates };
        localStorage.setItem("ecom_user", JSON.stringify(updated));
        return updated;
      })(),
    });
  }, []);

  return { user: state.user, token: state.token, loading: state.loading, login, logout, updateUser };
}
