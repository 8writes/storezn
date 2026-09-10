"use client";
import { useCallback } from "react";
import { networkErrorMessage, serverErrorMessage } from "@/lib/fetchError.js";
import { markOffline, markOnline } from "@/lib/connectivity.js";
import { deviceHeaders } from "@/lib/clientDevice.js";
import { killSession } from "@/lib/session.js";

export function useApi(token) {
  const apiFetch = useCallback(
    async (url, options = {}) => {
      let res;
      try {
        res = await fetch(url, {
          ...options,
          headers: {
            "Content-Type": "application/json",
            ...deviceHeaders(),
            ...(token && { Authorization: `Bearer ${token}` }),
            ...options.headers,
          },
        });
      } catch (err) {
        // Never reached the server - offline, DNS, connection reset. Give
        // callers a message they can show a user as-is, not "Failed to fetch".
        markOffline();
        throw new Error(networkErrorMessage(err) || "Couldn't reach the server. Check your connection and try again.");
      }
      // Got a response (any status) - the connection is alive.
      markOnline();

      let data;
      try {
        data = await res.json();
      } catch {
        if (!res.ok) throw new Error(serverErrorMessage(res.status));
        return null;
      }

      if (!res.ok) {
        const e = new Error(data?.error || serverErrorMessage(res.status));
        e.status = res.status;
        if (data?.banned) e.banned = true;
        // A dead session (401) or a device/account ban (403 + banned)
        // ends the session right now, mid-page - clear the stored token
        // and hard-redirect. Plain 403s ("you can't do that") don't.
        if (token && (res.status === 401 || (res.status === 403 && data?.banned))) {
          killSession(data?.banned ? "/banned" : "/login", data?.reason);
        }
        throw e;
      }

      return data;
    },
    [token],
  );

  return { apiFetch };
}
