import type { JSX } from "react";
import type { Metadata } from "next";
import { LegalPage } from "@/components/public/LegalPage";

export const metadata: Metadata = {
  title: "Cancellation Policy | WBMSG",
  description: "How to stop using WBMSG and what happens to billing and data.",
  alternates: { canonical: "https://wbmsg.com/cancellation-policy" },
};

export default function CancellationPolicyPage(): JSX.Element {
  return (
    <LegalPage title="Cancellation Policy" updated="11 October 2026">
      <p>There is no contract term and no cancellation fee. You can stop using WBMSG whenever you like.</p>

      <h2>1. How to cancel</h2>
      <p>
        Email <a href="mailto:info@conveys.in">info@conveys.in</a> from the address of an account administrator, saying you want to close the organisation&rsquo;s account.
        We confirm in writing, normally within 2 working days. Simply not sending messages also means nothing is billed beyond the free allowance, because billing depends only on messages sent.
      </p>

      <h2>2. What happens to billing</h2>
      <ul>
        <li>You pay for messages counted up to the cancellation date. A final statement is issued for the part-cycle up to that date, using the same volume bands.</li>
        <li>After that no further statements are issued and nothing recurs automatically; there is no card on file or standing instruction with us.</li>
        <li>Statements already issued remain payable. See the <a href="/refund-policy">Refund Policy</a> for billing errors.</li>
      </ul>

      <h2>3. Your data after cancellation</h2>
      <p>
        You can export your contacts and conversations before closing. After closure we keep your data for 30 days so you can change your mind, then delete or anonymise it,
        except billing and tax records we must keep by law.
      </p>

      <h2>4. If we end the service</h2>
      <p>
        If we discontinue WBMSG or suspend an account for reasons other than your breach of the terms, you will not be charged for any period after the service stops.
        We give at least 30 days&rsquo; notice where practicable.
      </p>

      <h2>5. Questions</h2>
      <p>Write to <a href="mailto:info@conveys.in">info@conveys.in</a>.</p>
    </LegalPage>
  );
}
