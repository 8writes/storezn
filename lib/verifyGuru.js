const DEFAULT_BASE_URL = "https://verifyguru.xyz/api/v1";
const VERIFY_TIMEOUT_MS = 12_000;

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

function namesLookConsistent(expected, actual) {
  const a = normalizeName(expected);
  const b = normalizeName(actual);
  if (!a || !b) return false;
  return a === b || b.includes(a) || a.includes(b);
}

function safeMessage(data, fallback) {
  const message = typeof data?.message === "string" ? data.message.trim() : "";
  return message || fallback;
}

export async function verifyNinWithVerifyGuru({ nin, firstName, lastName }) {
  const apiKey = process.env.VERIFYGURU_API_KEY;
  if (!apiKey) {
    return { approved: false, attempted: false, reason: "VerifyGuru API key is not configured" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

  try {
    const baseUrl = (process.env.VERIFYGURU_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
    const res = await fetch(`${baseUrl}/verify/nin`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ nin, firstname: firstName, lastname: lastName }),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || data?.status !== true) {
      return {
        approved: false,
        attempted: true,
        reason: safeMessage(data, `VerifyGuru returned HTTP ${res.status}`),
      };
    }

    const record = data?.data?.data || {};
    const providerStatus = String(data?.data?.status || "").toLowerCase();
    if (providerStatus !== "success") {
      return { approved: false, attempted: true, reason: "VerifyGuru did not return a successful NIN match" };
    }

    if (!namesLookConsistent(firstName, record.firstname) || !namesLookConsistent(lastName, record.lastname)) {
      return { approved: false, attempted: true, reason: "VerifyGuru returned identity names that need manual review" };
    }

    return { approved: true, attempted: true, reason: "NIN verified by VerifyGuru" };
  } catch (err) {
    return {
      approved: false,
      attempted: true,
      reason: err?.name === "AbortError" ? "VerifyGuru request timed out" : "VerifyGuru verification failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}
