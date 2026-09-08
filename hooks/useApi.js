"use client";
import { useCallback } from "react";
import { networkErrorMessage, serverErrorMessage } from "@/lib/fetchError.js";
import { markOffline, markOnline } from "@/lib/connectivity.js";

export function useApi(token) {
  const apiFetch = useCallback(
    async (url, options = {}) => {
      let res;
      try {
        res = await fetch(url, {
          ...options,
          headers: {
            "Content-Type": "application/json",
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
        throw new Error(data?.error || serverErrorMessage(res.status));
      }

      return data;
    },
    [token],
  );

  return { apiFetch };
}
