import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/Button.js";
import { BackLink } from "@/components/ui/BackLink.js";

// The one "you don't have this yet" screen.
//
// Every gated page used to draw its own: three copy-pasted cards that had
// already begun to drift, one with a text link instead of a button, one
// narrower than the rest, and one that was a bare sentence with no way to
// act on it. A vendor who hits two of them in a week should see the same
// thing twice, and when the upgrade copy changes it should change once.
//
// `plan` decides the wording, because the two tiers are sold differently:
// Storezn+ is self-serve, Enterprise is arranged with the team. Pages pass
// only what is specific to them - what the feature is and what it does.
const PLAN_COPY = {
  plus: {
    label: "Storezn+",
    cta: "See Storezn+",
    note: null,
  },
  enterprise: {
    label: "Storezn Enterprise",
    cta: "See Enterprise",
    // Said once, here, rather than tacked onto each page's description -
    // there is no self-serve checkout for Enterprise, so the button leads
    // to an explanation rather than a payment.
    note: "Enterprise is set up by the Storezn team.",
  },
};

export function FeatureLocked({ plan = "plus", feature, description, backHref, backLabel }) {
  const copy = PLAN_COPY[plan] || PLAN_COPY.plus;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {backHref && <BackLink href={backHref} label={backLabel || "Back"} />}
      <div className="bg-surface border border-slate-200 rounded-sm p-8 text-center">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <Lock size={20} />
        </span>
        <h1 className="text-lg font-bold text-slate-900">
          {feature} is a {copy.label} feature
        </h1>
        {description && (
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-800">{description}</p>
        )}
        {copy.note && <p className="mt-2 text-xs text-slate-600">{copy.note}</p>}
        <Link href="/vendor/plus" className="mt-5 inline-block">
          <Button type="button">{copy.cta}</Button>
        </Link>
      </div>
    </div>
  );
}
