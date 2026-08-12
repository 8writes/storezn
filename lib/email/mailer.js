// SendPulse's transactional email HTTP API - not raw SMTP. Vercel
// serverless functions get ephemeral, high-churn outbound IPs, and
// smtp-pulse.com's mail relay reliably times out (ETIMEDOUT) opening a
// direct socket from those IPs; a plain HTTPS call to their REST API
// doesn't have that problem. Needs a separate API ID/Secret pair from
// SendPulse's dashboard (Settings -> API) - distinct from the old
// SENDPULSE_SMTP_USER/PASS credentials, which this no longer uses.
const TOKEN_URL = "https://api.sendpulse.com/oauth/access_token";
const SEND_URL = "https://api.sendpulse.com/smtp/emails";

// Module-level cache, same reasoning as the old singleton transporter:
// reused across warm invocations of the same function instance, avoids
// re-authenticating on every send.
let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: process.env.SENDPULSE_API_ID,
      client_secret: process.env.SENDPULSE_API_SECRET,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.access_token) {
    throw new Error(data?.error_description || `SendPulse auth failed (${res.status})`);
  }
  cachedToken = data.access_token;
  // Refresh a minute early rather than racing the exact expiry.
  cachedTokenExpiresAt = Date.now() + Math.max(0, (data.expires_in || 3600) - 60) * 1000;
  return cachedToken;
}

export async function sendViaSendPulse(email) {
  const token = await getAccessToken();
  const res = await fetch(SEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.result === false) {
    throw new Error(data?.message || `SendPulse send failed (${res.status})`);
  }
  return data;
}

export function getMailerConfig() {
  return {
    from: process.env.SMTP_FROM || "support@ozmictech.com",
    fromName: process.env.SENDPULSE_FROM_NAME || "Storezn",
  };
}
