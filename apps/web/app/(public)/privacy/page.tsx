import type { JSX } from "react";
import type { Metadata } from "next";
import { LegalPage } from "@/components/public/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy | WBMSG",
  description: "How WBMSG collects, uses and protects personal information.",
  alternates: { canonical: "https://wbmsg.com/privacy" },
};

export default function PrivacyPage(): JSX.Element {
  return (
    <LegalPage title="Privacy Policy" updated="11 October 2026">
      <p>
        This policy explains how Conveys Information Technology (&ldquo;we&rdquo;), operator of WBMSG, handles personal information. It covers two groups: the people who use WBMSG for their business (&ldquo;customers&rdquo;),
        and the contacts our customers message through WBMSG (&ldquo;contacts&rdquo;).
      </p>

      <h2>1. Information we collect from customers</h2>
      <ul>
        <li><strong>Account details:</strong> name, email address, organisation name and details, and team members you invite.</li>
        <li><strong>Usage and billing records:</strong> message counts, billing statements and payment status. We do not store card numbers; payments are handled by our payment partners.</li>
        <li><strong>WhatsApp connection details:</strong> the identifiers and access needed to send and receive messages through Meta&rsquo;s WhatsApp Business Platform.</li>
        <li><strong>Technical data:</strong> basic logs and error reports used to keep the service secure and working.</li>
      </ul>

      <h2>2. Information about contacts</h2>
      <p>
        Customers add contacts and exchange WhatsApp messages with them through WBMSG. For that data the customer decides why and how it is used and we act as their service provider (processor),
        handling it only on their instructions to provide the service. Customers are responsible for having lawful grounds, including consent where required, to contact their contacts.
        If you are a contact and want to access, correct or delete your information, please ask the business that messaged you; we will help them respond.
      </p>

      <h2>3. How we use information</h2>
      <ul>
        <li>To provide, secure and support the service and to bill for it.</li>
        <li>To send service messages such as billing statements, reminders and usage alerts.</li>
        <li>To prevent fraud and abuse and to meet legal obligations.</li>
        <li>To improve WBMSG using aggregate usage information. We do not sell personal information.</li>
      </ul>

      <h2>4. Who we share it with</h2>
      <p>We share information only with providers that help us run WBMSG, under appropriate confidentiality and security terms, and when the law requires:</p>
      <ul>
        <li>Meta, to send and receive WhatsApp messages;</li>
        <li>Razorpay and Stripe, to process payments;</li>
        <li>cloud hosting, database, email and error-monitoring providers.</li>
      </ul>

      <h2>5. Security and retention</h2>
      <p>
        We use access controls, encryption in transit and organisation-level separation of data. Customers can configure how long messages are kept.
        We keep account and billing records for as long as needed to provide the service and to meet tax and legal requirements, then delete or anonymise them.
      </p>

      <h2>6. Your rights</h2>
      <p>You may ask us to access, correct or delete personal information we hold about you, or to withdraw consent where we rely on it. Write to <a href="mailto:info@conveys.in">info@conveys.in</a>; we aim to respond within 30 days.</p>

      <h2>7. Children</h2>
      <p>WBMSG is for businesses and is not directed to anyone under 18.</p>

      <h2>8. Changes and contact</h2>
      <p>We will post updates here with a new date. Questions or complaints: <a href="mailto:info@conveys.in">info@conveys.in</a>.</p>
    </LegalPage>
  );
}
