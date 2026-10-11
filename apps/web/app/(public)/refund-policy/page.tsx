import type { JSX } from "react";
import type { Metadata } from "next";
import { LegalPage } from "@/components/public/LegalPage";

export const metadata: Metadata = {
  title: "Refund Policy | WBMSG",
  description: "When and how WBMSG refunds a payment.",
  alternates: { canonical: "https://wbmsg.com/refund-policy" },
};

export default function RefundPolicyPage(): JSX.Element {
  return (
    <LegalPage title="Refund Policy" updated="11 October 2026">
      <p>
        WBMSG is billed after the fact, for messages already counted in a billing cycle. This policy explains when a payment is refunded.
      </p>

      <h2>1. What you pay for</h2>
      <p>
        Your WBMSG fee covers the cycle that has just ended, based on the messages Meta charges for in that cycle. Meta&rsquo;s own message charges are billed to you by Meta and are not paid to us, so they cannot be refunded by us.
      </p>

      <h2>2. When we refund</h2>
      <ul>
        <li><strong>Billing error:</strong> if a statement counts messages wrongly, bills the wrong band, or you are charged twice for the same statement, we refund the difference in full.</li>
        <li><strong>Payment taken but not credited:</strong> if a payment was captured and the statement still shows unpaid after 3 working days, we credit it or refund it.</li>
        <li><strong>Service failure on our side:</strong> if messages were counted because of a fault in WBMSG rather than your actions, we correct the count and refund any resulting overcharge.</li>
      </ul>

      <h2>3. When we do not refund</h2>
      <ul>
        <li>Messages that were sent and counted correctly, including messages you later regret sending or contacts who did not read them.</li>
        <li>Fees for a cycle after you used the service, even if you cancel afterwards.</li>
        <li>Charges made by Meta, taxes already remitted, or gateway charges outside our control, except where law requires.</li>
      </ul>

      <h2>4. How to ask</h2>
      <p>
        Email <a href="mailto:info@conveys.in">info@conveys.in</a> within 30 days of the statement date with your organisation name, the statement period and what looks wrong. We will reply within 3 working days.
      </p>

      <h2>5. How and when we pay refunds</h2>
      <p>
        Approved refunds go back to the original payment method (card, UPI or netbanking) through our payment partner. Once we approve a refund it is initiated within 5 working days, and your bank usually shows it within a further 5 to 7 working days.
      </p>
    </LegalPage>
  );
}
