// Every transactional email builds its HTML body with plain template
// literals (see sendMail.js's callers) rather than a templating engine
// that escapes by default - anywhere a vendor- or customer-supplied
// string (store name, product name, a person's name) gets interpolated
// into that HTML, it needs to go through this first. Otherwise a store
// name like `<img src=x onerror=...>` renders unescaped in every order
// confirmation email sent to that store's customers.
export function escapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
