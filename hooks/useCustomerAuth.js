"use client";
import { useCallback, useEffect, useReducer } from "react";
import { useParams } from "next/navigation";

// Storefront-facing counterpart to useAuth: separate localStorage keys
// (so a vendor's dashboard session and a shopper's storefront session
// never collide in the same browser), and no auto-redirect - guests are
// allowed on every storefront page, unlike the dashboard's requireAuth.
//
// Keys are further scoped by the current store's host (the [host] route
// param every storefront page lives under, see middleware.js), so a
// customer signed into Store A doesn't show as signed in when they visit
// Store B in the same browser tab - each store's shoppers are isolated
// from every other store's, not just from the vendor/admin dashboard.
const initialState = { user: null, token: null, loading: true };

function reducer(state, action) {
  switch (action.type) {
    case "LOADED":
      return { user: action.user, token: action.token, loading: false };
    case "CLEARED":
      return { user: null, token: null, loading: false };
    case "UPDATE_USER":
      return { ...state, user: action.user };
    default:
      return state;
  }
}

// Every component that calls this hook gets its own independent state,
// only ever read from localStorage on mount - so logging in from one
// component (the login page) never updates another's already-mounted
// state (the header's account menu) on its own. This event is the fix,
// same pattern as CartBadge.js's "cart:updated": login/logout/updateUser
// all fire it, and every instance listens and re-syncs from localStorage
// when it does, so the whole storefront (not just the component that
// triggered the change) reflects it immediately.
const AUTH_EVENT = "customer-auth:updated";

export function useCustomerAuth() {
  const { host } = useParams();
  const tokenKey = `ecom_customer_token::${host}`;
  const userKey = `ecom_customer_user::${host}`;
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const sync = () => {
      const token = localStorage.getItem(tokenKey);
      const user = localStorage.getItem(userKey);
      if (token && user) {
        try {
          dispatch({ type: "LOADED", token, user: JSON.parse(user) });
          return;
        } catch {
          // fall through to CLEARED
        }
      }
      dispatch({ type: "CLEARED" });
    };

    sync();
    window.addEventListener(AUTH_EVENT, sync);
    return () => window.removeEventListener(AUTH_EVENT, sync);
  }, [tokenKey, userKey]);

  const login = useCallback((token, user) => {
    localStorage.setItem(tokenKey, token);
    localStorage.setItem(userKey, JSON.stringify(user));
    dispatch({ type: "LOADED", token, user });
    window.dispatchEvent(new Event(AUTH_EVENT));
  }, [tokenKey, userKey]);

  const logout = useCallback(() => {
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(userKey);
    dispatch({ type: "CLEARED" });
    window.dispatchEvent(new Event(AUTH_EVENT));
  }, [tokenKey, userKey]);

  const updateUser = useCallback((user) => {
    localStorage.setItem(userKey, JSON.stringify(user));
    dispatch({ type: "UPDATE_USER", user });
    window.dispatchEvent(new Event(AUTH_EVENT));
  }, [userKey]);

  return { user: state.user, token: state.token, loading: state.loading, login, logout, updateUser };
}
