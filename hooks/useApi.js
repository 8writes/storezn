"use client";
import { useCallback } from "react";

export function useApi(token) {
  const apiFetch = useCallback(
    async (url, options = {}) => {
      const res = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(token && { Authorization: `Bearer ${token}` }),
          ...options.headers,
        },
      });

      let data;
      try {
        data = await res.json();
      } catch {
        if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
        return null;
      }

      if (!res.ok) {
        throw new Error(data?.error || `Request failed: ${res.status}`);
      }

      return data;
    },
    [token],
  );

  return { apiFetch };
}
