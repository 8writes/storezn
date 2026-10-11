// Binding a timestamp into a raw sql`` template.
//
// Inside a raw template there is no column in play, so drizzle has no
// mapToDriverValue to convert with and hands the value straight to
// postgres-js, which cannot serialise a Date for a bind parameter - it
// throws `The "string" argument must be of type string ... Received an
// instance of Date`. The ordinary .set({ col: date }) form works only
// because the column mapper runs there.
//
// This has now bitten twice: once in the Paystack subscription webhook
// (every renewal 500'd) and once in the rate limiter, where a bare catch
// swallowed it so the DB-backed limiter silently never worked at all.
// Both now go through here.
//
// "YYYY-MM-DD HH:MM:SS.sss" in UTC is what the app's bare `timestamp`
// columns already store, so ::timestamp parses it with no offset guesswork.
export function utcTimestampLiteral(date) {
  const value = date instanceof Date ? date : new Date(date);
  const safe = Number.isNaN(value.getTime()) ? new Date() : value;
  return safe.toISOString().replace("T", " ").replace("Z", "");
}
