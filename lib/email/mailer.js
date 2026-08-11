import nodemailer from "nodemailer";

// SendPulse SMTP relay. host/port/secure are fixed by SendPulse, only the
// account credentials vary per environmen.
let transporter = null;
export function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: "smtp-pulse.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.SENDPULSE_SMTP_USER,
        pass: process.env.SENDPULSE_SMTP_PASS,
      },
    });
  }
  return transporter;
}

export function getMailerConfig() {
  return {
    from: process.env.SMTP_FROM || "support@ozmictech.com",
    fromName: process.env.SENDPULSE_FROM_NAME || "Storezn",
  };
}
