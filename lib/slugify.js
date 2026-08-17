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

// Same idea, but for a store's slug specifically - that one becomes the
// actual subdomain (<slug>.storezn.com, see lib/storeUrl.js), where a
// run of hyphens reads worse and is easier to mistype/misremember than a
// product URL path segment. Words just concatenate instead of getting a
// separator, e.g. "TK Gadget Hub" -> "tkgadgethub".
export function slugifyStoreName(text) {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "");
}
