// Turns a display name into a URL-safe slug, e.g. "Red Tote Bag!" ->
// "red-tote-bag". Used to auto-generate a product's slug from its name at
// creation, so the vendor never has to think about URL formatting
// themselves.
export function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
