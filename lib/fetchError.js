// Turn a raw fetch() rejection or a bad response into a message the user
// can actually act on, instead of a blanket "Something went wrong".
//
//   const res = await fetch(url).catch((e) => { throw e; });
//   ...
//   catch (err) { toast.error(fetchErrorMessage(err)); }

const NETWORK_RE = /failed to fetch|networkerror|network request failed|load failed|connection|timed? ?out/i;

// A fetch() that never got a response - offline, DNS failure, connection
// reset, CORS, request timeout. Returns a message, or null if this
// doesn't look like a connectivity problem.
export function networkErrorMessage(err) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "You appear to be offline. Check your internet connection and try again.";
  }
  if (err instanceof TypeError || err?.name === "TypeError" || err?.name === "AbortError" || NETWORK_RE.test(err?.message || "")) {
    return "Couldn't reach the server. Check your internet connection and try again.";
  }
  return null;
}

// General-purpose: network message if it's a connectivity issue,
// otherwise a safe generic. Never surfaces a raw stack/technical string.
export function fetchErrorMessage(err, fallback = "Something went wrong. Please try again in a moment.") {
  return networkErrorMessage(err) || fallback;
}

// A non-2xx response that carried no usable JSON error (a proxy 502/504,
// a crashed handler, an HTML error page). `status` shapes the wording.
export function serverErrorMessage(status) {
  if (status === 429) return "Too many attempts. Wait a minute and try again.";
  if (status >= 500 || status === 0) return "The server had a problem. Please try again in a moment.";
  return "Request failed. Please try again.";
}

// res.json() that won't throw - returns null when the body isn't JSON.
export async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
