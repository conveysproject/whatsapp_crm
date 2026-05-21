import Link from "next/link";
import Image from "next/image";
import type { JSX } from "react";

export function ConveysFooter(): JSX.Element {
  return (
    <footer className="bg-slate-900 text-slate-400">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">

        <div className="mb-10">
          <Image src="/conveys-logo.png" alt="Conveys Information Technology" width={180} height={54} className="h-12 w-auto object-contain" />
          <p className="mt-2 text-xs text-slate-500">Turning Ideas Into Digital Reality</p>
        </div>

        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Quick Links</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li><Link href="/" className="transition hover:text-white">Home</Link></li>
              <li><Link href="/#services" className="transition hover:text-white">Services</Link></li>
              <li><Link href="/#about" className="transition hover:text-white">About</Link></li>
              <li><Link href="/#contact" className="transition hover:text-white">Contact</Link></li>
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Services</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li><Link href="/services/web-development" className="transition hover:text-white">Web Development</Link></li>
              <li><Link href="/services/mobile-app-development" className="transition hover:text-white">Mobile App Development</Link></li>
              <li><Link href="/services/whatsapp-crm" className="transition hover:text-white">WhatsApp CRM</Link></li>
              <li><Link href="/services/ai-solutions" className="transition hover:text-white">AI Solutions</Link></li>
              <li><Link href="/services/cloud-infrastructure-setup" className="transition hover:text-white">Cloud Infrastructure</Link></li>
              <li><Link href="/services/devops-cicd" className="transition hover:text-white">DevOps & CI/CD</Link></li>
              <li><Link href="/services/digital-marketing" className="transition hover:text-white">Digital Marketing</Link></li>
              <li><Link href="/services/saas-product-development" className="transition hover:text-white">SaaS Development</Link></li>
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Legal</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li><Link href="/privacy" className="transition hover:text-white">Privacy Policy</Link></li>
              <li><Link href="/terms" className="transition hover:text-white">Terms of Service</Link></li>
              <li><Link href="/cancellation" className="transition hover:text-white">Cancellation Policy</Link></li>
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Contact</h2>
            <address className="mt-4 space-y-2.5 text-sm not-italic">
              <p>
                SwaminarayanCity, Dombivli West
                <br />
                Mumbai, Maharashtra 421202
              </p>
              <p>
                <a href="mailto:info@conveys.in" className="transition hover:text-white">
                  info@conveys.in
                </a>
              </p>
              <p>
                <a href="tel:+919907072035" className="font-semibold text-white transition hover:text-blue-400">
                  +91 99070 72035
                </a>
              </p>
            </address>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-xs sm:flex-row">
          <span>© {new Date().getFullYear()} Conveys Information Technology. All rights reserved.</span>
          <a href="#top" className="font-medium text-blue-400 transition hover:text-blue-300">
            Back to top ↑
          </a>
        </div>
      </div>
    </footer>
  );
}
