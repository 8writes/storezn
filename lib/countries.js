// Countries for delivery addresses and vendor delivery settings.
//
// Stored and compared by English NAME ("Nigeria", "United Kingdom"),
// because addresses.country has always held "Nigeria" as a name. Names come
// from Intl.DisplayNames over the ISO 3166 codes, so the client and server
// produce the same spelling. Client-safe.

export const NIGERIA = "Nigeria";

const ISO_CODES = [
  "AD","AE","AF","AG","AI","AL","AM","AO","AR","AS","AT","AU","AW","AX","AZ",
  "BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR","BS","BT","BW","BY","BZ",
  "CA","CC","CD","CF","CG","CH","CI","CK","CL","CM","CN","CO","CR","CU","CV","CW","CX","CY","CZ",
  "DE","DJ","DK","DM","DO","DZ","EC","EE","EG","EH","ER","ES","ET","FI","FJ","FK","FM","FO","FR",
  "GA","GB","GD","GE","GF","GG","GH","GI","GL","GM","GN","GP","GQ","GR","GT","GU","GW","GY",
  "HK","HN","HR","HT","HU","ID","IE","IL","IM","IN","IO","IQ","IR","IS","IT","JE","JM","JO","JP",
  "KE","KG","KH","KI","KM","KN","KP","KR","KW","KY","KZ","LA","LB","LC","LI","LK","LR","LS","LT","LU","LV","LY",
  "MA","MC","MD","ME","MF","MG","MH","MK","ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ",
  "NA","NC","NE","NF","NG","NI","NL","NO","NP","NR","NU","NZ","OM","PA","PE","PF","PG","PH","PK","PL","PM","PN","PR","PS","PT","PW","PY",
  "QA","RE","RO","RS","RU","RW","SA","SB","SC","SD","SE","SG","SH","SI","SK","SL","SM","SN","SO","SR","SS","ST","SV","SX","SY","SZ",
  "TC","TD","TG","TH","TJ","TK","TL","TM","TN","TO","TR","TT","TV","TW","TZ","UA","UG","US","UY","UZ",
  "VA","VC","VE","VG","VI","VN","VU","WF","WS","XK","YE","YT","ZA","ZM","ZW",
];

const displayNames = new Intl.DisplayNames(["en"], { type: "region" });

export const COUNTRY_NAMES = ISO_CODES
  .map((code) => {
    try { return displayNames.of(code); } catch { return null; }
  })
  .filter((name) => typeof name === "string" && name.length > 0)
  .sort((a, b) => a.localeCompare(b));

// Nigeria first - it's where almost every customer is.
export const COUNTRY_OPTIONS = [NIGERIA, ...COUNTRY_NAMES.filter((name) => name !== NIGERIA)].map((name) => ({
  value: name,
  label: name,
}));

// Every country except Nigeria, for "which countries do you ship to".
export const FOREIGN_COUNTRY_OPTIONS = COUNTRY_OPTIONS.filter((option) => option.value !== NIGERIA);

const BY_LOWER = new Map(COUNTRY_NAMES.map((name) => [name.toLowerCase(), name]));

// A country string as stored: the canonical spelling when it's a known
// country, Nigeria when blank (every address before this existed), or the
// trimmed input otherwise.
export function normaliseCountry(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return NIGERIA;
  return BY_LOWER.get(trimmed.toLowerCase()) || trimmed;
}

export function isNigeria(value) {
  return normaliseCountry(value) === NIGERIA;
}

export function isKnownCountry(value) {
  return BY_LOWER.has(String(value ?? "").trim().toLowerCase());
}

// The place part of an address on one line: "Ikeja, Lagos, 100001" at
// home, and "Manchester, England, M1 1AA, United Kingdom" abroad. The
// postcode shows whenever one was given; the country only when it isn't
// Nigeria, so existing Nigerian addresses read exactly as they always have.
export function formatAddressPlace(address) {
  if (!address) return "";
  const country = normaliseCountry(address.country);
  const parts = [address.city, address.state, address.postalCode];
  if (country !== NIGERIA) parts.push(country);
  return parts.map((part) => String(part ?? "").trim()).filter(Boolean).join(", ");
}
