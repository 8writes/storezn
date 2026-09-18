import { sql } from "drizzle-orm";

export const PRODUCT_NAME_UNIQUE_INDEX = "uq_products_store_name_normalized";
export const PRODUCT_NAME_TAKEN_MESSAGE = "A product with that name already exists in this store";

// Preserve intentional display casing, but remove invisible differences
// that otherwise create look-alike catalogue entries.
export function normalizeProductName(name) {
  return String(name || "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function productNameKey(name) {
  return normalizeProductName(name).toLowerCase().replace(/\s+/g, "");
}

export function productNameKeyExpression(column) {
  return sql`lower(regexp_replace(trim(${column}), '[[:space:]]+', '', 'g'))`;
}

export function isProductNameUniqueViolation(error) {
  return error?.code === "23505" && error?.constraint_name === PRODUCT_NAME_UNIQUE_INDEX;
}
