const DEFAULT_BASE_URL = "https://verifyguru.xyz/api/v1";
const VERIFY_TIMEOUT_MS = 12_000;

// VerifyGuru does NOT check the names sent to it. Verified against the
// live endpoint: a real NIN submitted with the invented name "DARĆ AGAIN"
// came back `status: success`, "NIN verified successfully", and the real
// holder's record. It is a lookup, not a match.
//
// So this comparison is the ONLY thing binding a NIN to the person
// claiming it. Without it, anyone holding any valid NIN would be
// auto-approved into a live store with a payout account attached. It
// cannot be relaxed to "the provider said success".
//
// What it must tolerate, because these are all the same person:
//   - the record listing the surname first (routine on NIN records, and
//     the reason the old positional comparison failed every real
//     submission - 6 of 6 went to manual review)
//   - a middle name present on one side and not the other
//   - accents and punctuation ("DARĆ" / "O'Neil" / "Ade-Bayo")
const deaccent = (value) =>
  String(value || "")
    // Decompose accents so "Ć" becomes "C" rather than being dropped
    // entirely by the letters-only filters below.
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// "Ade-Bayo" -> "adebayo". Lets a joined spelling match a separated one.
const squashName = (value) => deaccent(value).replace(/[^a-z]/g, "");

// "Ade-Bayo" -> ["ade", "bayo"].
const splitName = (value) => deaccent(value).split(/[^a-z]+/).filter(Boolean);

// Every name the vendor signed up with has to appear in the NIN record,
// in any order. A name is the unit of comparison, not a token: "O'Neil"
// has to match a record spelling it "Oneil", so each submitted name is
// accepted if its joined form is on the record OR all of its parts are.
// A single letter is treated as an initial.
export function namesLookConsistent(submitted, recordNames) {
  const onRecord = new Set();
  for (const name of recordNames) {
    for (const part of splitName(name)) onRecord.add(part);
    const joined = squashName(name);
    if (joined) onRecord.add(joined);
  }

  const claimed = submitted
    .map((name) => ({ joined: squashName(name), parts: splitName(name) }))
    .filter((name) => name.joined);

  if (claimed.length === 0 || onRecord.size === 0) return false;

  const matches = (part) =>
    part.length === 1
      ? [...onRecord].some((name) => name.startsWith(part))
      : onRecord.has(part);

  return claimed.every((name) => onRecord.has(name.joined) || name.parts.every(matches));
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

    if (!namesLookConsistent([firstName, lastName], [record.firstname, record.middlename, record.lastname])) {
      return {
        approved: false,
        attempted: true,
        reason: "The NIN is real, but it is registered to a different name - needs manual review",
      };
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
