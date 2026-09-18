export const ADMIN_EMAIL_TEMPLATES = [
  { id: "custom", label: "Custom message", title: "", body: "" },
  {
    id: "maintenance",
    label: "Scheduled maintenance",
    title: "Scheduled Storezn maintenance",
    body: "Storezn will be temporarily unavailable while we perform scheduled maintenance. We will let you know as soon as service is fully restored.",
  },
  {
    id: "feature",
    label: "New feature",
    title: "A new Storezn feature is available",
    body: "We have added a new feature to help you run your store more efficiently. Sign in to your dashboard to take a look.",
  },
  {
    id: "action_required",
    label: "Action required",
    title: "Action required on your Storezn account",
    body: "Please sign in to your Storezn dashboard and review the required account action. Completing it promptly will help prevent interruptions to your store.",
  },
  {
    id: "policy",
    label: "Policy update",
    title: "Important Storezn policy update",
    body: "We have updated an important Storezn policy. Please review the latest information and contact support if you have any questions.",
  },
  {
    id: "tip",
    label: "Store growth tip",
    title: "A quick tip for your Storezn store",
    body: "Keep your product photos, prices, and stock levels up to date so customers can shop with confidence.",
  },
];

export function getAdminEmailTemplate(id) {
  return ADMIN_EMAIL_TEMPLATES.find((template) => template.id === id) || ADMIN_EMAIL_TEMPLATES[0];
}
