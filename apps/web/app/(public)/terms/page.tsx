import type { JSX } from "react";
import type { Metadata } from "next";
import { LegalPage } from "@/components/public/LegalPage";

export const metadata: Metadata = {
  title: "Terms and Conditions | WBMSG",
  description: "The terms that govern use of the WBMSG WhatsApp communication and marketing platform.",
  alternates: { canonical: "https://wbmsg.com/terms" },
};

export default function TermsPage(): JSX.Element {
  return (
    <LegalPage title="Terms and Conditions" updated="11 October 2026">
      <p>
        These terms govern your use of WBMSG, a WhatsApp communication and marketing platform operated by Conveys Information Technology (&ldquo;we&rdquo;, &ldquo;us&rdquo;).
        By creating an account or using the service you agree to them. If you use WBMSG for an organisation, you confirm you may bind that organisation.
      </p>

      <h2>1. The service</h2>
      <p>
        WBMSG lets businesses manage contacts, run a shared team inbox, send WhatsApp campaigns and automations, and view analytics, using the WhatsApp Business Platform provided by Meta.
        We may improve, change or discontinue features, and will give reasonable notice of material changes that reduce what you have paid for.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must be at least 18 and provide accurate information.</li>
        <li>You are responsible for activity under your account and for keeping credentials secure. Tell us promptly at info@conveys.in if you suspect misuse.</li>
        <li>You decide who in your organisation has access and with which permissions.</li>
      </ul>

      <h2>3. WhatsApp and Meta</h2>
      <p>
        Messaging runs on Meta&rsquo;s WhatsApp Business Platform. You must follow the WhatsApp Business Terms, the WhatsApp Business Messaging Policy and Meta&rsquo;s commerce rules.
        Meta&rsquo;s own message charges are billed to you directly by Meta; WBMSG adds no markup to them. Meta may restrict or suspend a number, template or account, and we are not responsible for Meta&rsquo;s decisions.
      </p>

      <h2>4. Acceptable use</h2>
      <p>You agree not to send unlawful, deceptive, abusive or unsolicited messages, or to message people who have not consented where consent is required. You are responsible for the content you send and for lawful grounds to contact each recipient. We may suspend an account that puts the service, other customers or recipients at risk.</p>

      <h2>5. Fees and billing</h2>
      <ul>
        <li>WBMSG is billed in arrears, once per billing cycle. A cycle starts on the day your organisation registered and ends the day before the same date next month.</li>
        <li>The fee depends on how many messages in the cycle Meta charges for, in published volume bands, with a monthly maximum. The first 500 such messages in each cycle are free. Current prices are shown on the Billing page in your account.</li>
        <li>Each statement is sent with a secure online payment link (card, UPI or netbanking through Razorpay, or card through Stripe) and is due 7 days after it is issued. We send reminders after the due date.</li>
        <li>Prices exclude applicable taxes, which are added where required. Fees are stated in Indian rupees or US dollars as shown on your statement.</li>
        <li>We will give at least 30 days&rsquo; notice before changing prices or bands. Changes apply to later billing cycles only.</li>
        <li>Refunds and cancellation are covered in the <a href="/refund-policy">Refund Policy</a> and <a href="/cancellation-policy">Cancellation Policy</a>.</li>
      </ul>

      <h2>6. Your data</h2>
      <p>
        You own the contacts, messages and other content you put into WBMSG. We process it only to provide the service, as described in our <a href="/privacy">Privacy Policy</a>.
        You are responsible for having the right to upload and message the contacts you add.
      </p>

      <h2>7. Availability</h2>
      <p>We work to keep WBMSG available but do not promise uninterrupted service. The service depends on third parties such as Meta, so delivery of any message is not guaranteed.</p>

      <h2>8. Intellectual property</h2>
      <p>WBMSG, its software and branding belong to us. We grant you a limited, non-exclusive, non-transferable right to use the service during your subscription. You may not copy, resell or reverse-engineer it.</p>

      <h2>9. Liability</h2>
      <p>
        To the extent the law allows, the service is provided &ldquo;as is&rdquo;, and our total liability for any claim relating to the service is limited to the fees you paid us in the three months before the claim arose.
        We are not liable for indirect or consequential loss, lost profits, or loss caused by Meta, network or other third-party failures.
      </p>

      <h2>10. Ending the agreement</h2>
      <p>You may stop using WBMSG at any time (see the Cancellation Policy). We may suspend or end access for breach of these terms or non-payment after reminders, with notice where practicable. Sections that by nature should survive, including payment of fees owed, remain in force.</p>

      <h2>11. Governing law</h2>
      <p>These terms are governed by the laws of India. Courts in India have jurisdiction, subject to any rights you have under mandatory consumer law.</p>

      <h2>12. Changes and contact</h2>
      <p>We may update these terms and will post the new date above; material changes will be notified in the app or by email. Questions: <a href="mailto:info@conveys.in">info@conveys.in</a>.</p>
    </LegalPage>
  );
}
