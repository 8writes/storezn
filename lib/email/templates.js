import { escapeHtml } from "./escapeHtml.js";

const STOREZN_GREEN = "#14915b";

function safeColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : STOREZN_GREEN;
}

export function emailBrand(store) {
  if (!store) return { name: "Storezn", accentColor: STOREZN_GREEN, logoUrl: null };
  return {
    name: store.name || "Storezn",
    accentColor: safeColor(store.storefrontAccentColor),
    logoUrl: typeof store.logoUrl === "string" && /^https:\/\//i.test(store.logoUrl) ? store.logoUrl : null,
  };
}

export function emailText(value) {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

export function emailButton(url, label, accentColor = STOREZN_GREEN) {
  const accent = safeColor(accentColor);
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="border-radius:4px;background:${accent}"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700">${escapeHtml(label)}</a></td></tr></table>`;
}

export function renderEmail({ content, brand, preheader = "" }) {
  const identity = emailBrand(brand);
  const accent = identity.accentColor;
  const logo = identity.logoUrl
    ? `<img src="${escapeHtml(identity.logoUrl)}" width="160" alt="${escapeHtml(identity.name)}" style="display:block;max-width:160px;max-height:48px;width:auto;height:auto;border:0">`
    : `<div style="font-size:22px;line-height:28px;font-weight:800;color:#0f172a">${escapeHtml(identity.name)}</div>`;
  const footer = identity.name === "Storezn" ? "Storezn" : `${escapeHtml(identity.name)} · Powered by Storezn`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;background:#f6f5f3;color:#334155;font-family:Arial,sans-serif}
  .email-content h1,.email-content h2{margin:0 0 14px;color:#0f172a;font-size:22px;line-height:30px}
  .email-content p{margin:0 0 16px;font-size:15px;line-height:24px}
  .email-content a{color:${accent};font-weight:700}
  .email-content table:not([role="presentation"]){width:100%;border-collapse:collapse;margin:18px 0;font-size:14px}
  .email-content table:not([role="presentation"]) td,.email-content table:not([role="presentation"]) th{padding:10px;border-bottom:1px solid #e2e8f0;text-align:left}
</style></head>
<body>
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f3"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden">
    <tr><td style="height:5px;background:${accent};font-size:0">&nbsp;</td></tr>
    <tr><td style="padding:26px 30px 20px;border-bottom:1px solid #e2e8f0">${logo}</td></tr>
    <tr><td class="email-content" style="padding:30px">${content}</td></tr>
    <tr><td style="padding:20px 30px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:18px">${footer}<br>This is an automated email. Please do not share secure links from this message.</td></tr>
  </table>
</td></tr></table>
</body></html>`;
}
