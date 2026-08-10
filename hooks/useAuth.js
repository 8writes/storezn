"use client";
import { useReducer, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

const initialState = { user: null, token: null, loading: true };

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
