import type { JSX } from "react";
import type { Metadata } from "next";
import { LegalPage } from "@/components/public/LegalPage";

export const metadata: Metadata = {
  title: "Contact Us | WBMSG",
  description: "How to reach the WBMSG team for support, billing and legal questions.",
  alternates: { canonical: "https://wbmsg.com/contact" },
};

export default function ContactPage(): JSX.Element {
  return (
    <LegalPage title="Contact Us" updated="11 October 2026">
      <p>WBMSG is operated by <strong>Conveys Information Technology</strong>, India.</p>

      <h2>Email</h2>
      <p>
        <a href="mailto:info@conveys.in">info@conveys.in</a> for support, billing, refunds, cancellation and privacy requests.
        We reply within 3 working days.
      </p>

      <h2>What to include</h2>
      <ul>
        <li>Your organisation name and the email you sign in with.</li>
        <li>For billing questions, the billing period on the statement.</li>
        <li>A short description of the issue, and a screenshot if it helps.</li>
      </ul>

      <h2>Policies</h2>
      <ul>
        <li><a href="/terms">Terms and Conditions</a></li>
        <li><a href="/privacy">Privacy Policy</a></li>
        <li><a href="/refund-policy">Refund Policy</a></li>
        <li><a href="/cancellation-policy">Cancellation Policy</a></li>
      </ul>
    </LegalPage>
  );
}
