// Collapse the aliases of one real mailbox to a single canonical form so
// signup can't be farmed with foo+1@gmail.com / foo+2@gmail.com / etc.
//
//  - "+tag" in the local part is dropped for every provider (plus-
//    addressing is near-universal, and where it isn't the collision is
//    harmless).
//  - Gmail / Googlemail also ignore dots in the local part, and treat
//    googlemail.com as gmail.com.
//
// The user's typed email is still stored as-is for display / sending;
// this value only backs the uniqueness check (customers.normalizedEmail).

const GMAIL = new Set(["gmail.com", "googlemail.com"]);

export function normalizeEmail(raw) {
  const email = String(raw || "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return email;

  let local = email.slice(0, at);
  let domain = email.slice(at + 1);

  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);

  if (GMAIL.has(domain)) {
    local = local.replace(/\./g, "");
    domain = "gmail.com";
  }
  return `${local}@${domain}`;
}

export function emailDomain(raw) {
  const email = String(raw || "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  return at > 0 ? email.slice(at + 1) : "";
}

// Does `email` fall under any of the blocked entries?
// rows: [{ value, kind }]  kind = 'email' (matched against normalizeEmail)
// or 'domain' (matched against emailDomain).
export function isEmailBlocked(email, rows) {
  if (!rows?.length) return false;
  const norm = normalizeEmail(email);
  const domain = emailDomain(email);
  return rows.some((r) => (r.kind === "domain" ? r.value === domain : r.value === norm));
}
