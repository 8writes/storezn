// Reading a Postgres error through drizzle.
//
// drizzle-orm wraps every failed query in a DrizzleQueryError that carries
// only { query, params, cause } - it does NOT copy `code`,
// `constraint_name` or `detail` up from the driver. Verified against
// production (drizzle-orm 0.45.4, postgres-js):
//
//   constructor : DrizzleQueryError
//   err.code    : undefined
//   err.cause   : PostgresError
//   cause.code  : "23505"
//
// So the very natural `if (err.code === "23505")` is always false, and
// every recovery written that way silently became a 500 instead. That is
// not theoretical: it is why a logged-in shopper double-tapping "add to
// cart" got an error page rather than their cart, and why a POS sale that
// actually committed could still report failure to the cashier.
//
// Always go through these helpers rather than reaching for `.code`.

export const UNIQUE_VIOLATION = "23505";
export const FOREIGN_KEY_VIOLATION = "23503";
export const NOT_NULL_VIOLATION = "23502";

// The driver-level error, wherever it sits in the cause chain. Returns the
// first link that actually carries a Postgres code, so this keeps working
// if drizzle ever adds another wrapper.
export function pgError(err) {
  for (let current = err; current; current = current.cause) {
    if (current.code) return current;
  }
  return null;
}

export function pgErrorCode(err) {
  return pgError(err)?.code || null;
}

// The constraint that was violated. Drivers disagree on the field name
// (`constraint_name` vs `constraint`), and some surface it only inside
// `detail`, so check all three before concluding it isn't there.
export function pgConstraint(err) {
  const error = pgError(err);
  if (!error) return null;
  return error.constraint_name || error.constraint || null;
}

// `constraint` optionally narrows it: pass a name (or a fragment, e.g.
// "slug") when a table has more than one unique index and they mean
// different things to the user.
export function isUniqueViolation(err, constraint = null) {
  if (pgErrorCode(err) !== UNIQUE_VIOLATION) return false;
  if (!constraint) return true;
  const name = pgConstraint(err) || "";
  const detail = pgError(err)?.detail || "";
  return name.includes(constraint) || detail.includes(constraint);
}
