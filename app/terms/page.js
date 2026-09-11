import Link from "next/link";
import { Footer } from "@/components/Footer";

export const metadata = {
  title: "Terms of Service - Storezn",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <main className="flex-1 max-w-2xl mx-auto px-4 sm:px-6 py-16 space-y-10">
        <div>
          <Link href="/" className="text-sm text-brand-600 hover:underline"> Storezn</Link>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 mt-4">Terms of Service</h1>
          <p className="text-sm text-slate-700 mt-1">Last updated September 2026</p>
        </div>

        <div className="space-y-8 text-sm text-slate-700 leading-relaxed">
          <p>
            These Terms govern your use of Storezn (&quot;the platform&quot;) as a vendor operating a store, or as a customer
            shopping on one. By creating an account, you agree to them.
          </p>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-slate-900">1. What Storezn is</h2>
            <p>
              Storezn lets a vendor set up their own online store on the platform and sell physical or digital products
              to customers. We provide the storefront, checkout, payment processing, and order management - the vendor
              is solely responsible for the products they list, their accuracy, their fulfillment, and their delivery.
              Storezn is not a party to the sale between a vendor and a customer.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-slate-900">2. Vendor identity verification</h2>
            <p>
              A new vendor account can set up their store and add products immediately, but the store will not be
              visible to customers or able to take orders until the vendor submits a valid National Identification
              Number (NIN) and it is reviewed and approved by a Storezn administrator. We may reject a submission or
              suspend an already-approved account if we reasonably believe the information provided is false or the
              account is being used fraudulently.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-slate-900">3. Fees and payouts</h2>
            <p>
              Storezn charges a commission on each sale, calculated as a percentage of the order subtotal.
            </p>
            <p>
              Each vendor chooses, for their own store, who pays this commission: by default the vendor absorbs it (it
              is deducted from their payout, and the customer pays exactly the listed price plus shipping), or the
              vendor may instead choose to pass it on, in which case it is added on top and shown to the customer as a
              separate &quot;Platform fee&quot; line at checkout. This choice can be changed at any time from the store&apos;s
              settings and applies to every order placed after the change.
            </p>
            <p>
              Payouts are not held or disbursed manually by Storezn. Every paid order is settled automatically at the
              point of payment, directly to the bank account they&apos;ve linked. A vendor
              cannot receive payouts until a payout account has been linked and verified.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-slate-900">4. Shipping</h2>
            <p>
              A vendor sets their own shipping fees - a flat default, or more specific rates by state or by city/LGA -
              and is responsible for fulfilling and delivering physical orders to the address the customer provides.
              Storezn does not handle physical fulfillment or delivery on a vendor&apos;s behalf.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-slate-900">5. Acceptable use</h2>
            <p>
              You may not use Storezn to list or sell anything illegal, counterfeit, stolen, or that infringes someone
              else&apos;s intellectual property; to mislead customers about a product, its price, or its availability; or
              to attempt to circumvent the platform&apos;s fees by directing customers to complete a sale outside it. You
              may not attempt to interfere with the platform&apos;s security, another user&apos;s account, or another store&apos;s
              operation.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-slate-900">6. Restrictions</h2>
            <p>You may not, and may not permit or help anyone else to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>reverse-engineer, decompile, or otherwise attempt to derive the source code or underlying structure of the platform;</li>
              <li>copy, imitate, or reproduce the platform&apos;s features, workflows, or design for the purpose of building a competing product;</li>
              <li>scrape, crawl, harvest, or bulk-download data from the platform by any automated or manual means;</li>
              <li>create accounts in bulk, or share your account credentials or access with anyone else;</li>
              <li>use the platform, or any data or output obtained from it, for a commercial purpose other than operating your own store or shopping as a customer;</li>
              <li>resell, sublicense, rent, or otherwise redistribute the platform or access to it;</li>
              <li>modify, adapt, translate, or create derivative works of the platform or its code.</li>
            </ul>
            <p>
              A violation of this section may result in the immediate suspension or permanent ban of the account and any
              device associated with it, without notice, and Storezn reserves the right to pursue any legal remedies
              available to it.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-slate-900">7. Enforcement, suspension, and appeals</h2>
            <p>
              To keep the platform safe and to detect abuse (bulk account creation, scraping, fraud, and the conduct in
              section 6), we collect and process limited technical information about the connections and devices used to
              access Storezn, including an IP address, a randomly-generated device identifier, and a small set of
              non-identifying browser characteristics. This is described in full in our{" "}
              <a href="/privacy" className="text-brand-600 hover:underline">Privacy Policy</a>.
            </p>
            <p>
              We may suspend or ban an account, or block a device, automatically (for example after repeated blocked
              signup attempts from one device) or by manual review. If your access has been restricted and you believe it
              was in error, you may appeal by emailing{" "}
              <a href="mailto:support@ozmictech.com?subject=Account%20appeal" className="text-brand-600 hover:underline">support@ozmictech.com</a>{" "}
              from the email address on the account, describing what happened. We aim to respond within a few business
              days.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-slate-900">8. Orders, refunds, and disputes</h2>
            <p>
              A customer may request a refund on a delivered order, stating their reason. The vendor reviews and
              decides on that request. Storezn may step in if a vendor is unresponsive or a pattern of complaints
              suggests a policy violation, but day-to-day order and refund decisions are the vendor&apos;s responsibility.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-slate-900">9. Suspension and termination</h2>
            <p>
              We may suspend an individual product, a vendor&apos;s entire store, or an account, if we reasonably believe
              this agreement, the law, or a customer&apos;s rights are being violated. A suspended product or store is
              removed from the storefront until the issue is resolved or the suspension is lifted; a vendor cannot
              reverse a platform-issued suspension themselves. Either party may otherwise close an account at any time;
              outstanding orders and payouts already in progress are still settled per these Terms.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-slate-900">10. Limitation of liability</h2>
            <p>
              Storezn provides the platform &quot;as is.&quot; To the extent permitted by law, we are not liable for a
              vendor&apos;s products, listings, fulfillment, or conduct, or for a customer&apos;s misuse of a product purchased
              through the platform. Our liability for any claim relating to the platform itself is limited to the fees
              we actually collected from the account in question in the three months before the claim arose.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-slate-900">11. Changes to these Terms</h2>
            <p>
              We may update these Terms as the platform changes. Continuing to use Storezn after an update means you
              accept the revised Terms.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-slate-900">12. Contact</h2>
            <p>
              Questions about these Terms can be sent to{" "}
              <a href="mailto:support@ozmictech.com" className="text-brand-600 hover:underline">support@ozmictech.com</a>.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
