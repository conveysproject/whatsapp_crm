import type { JSX } from "react";
import type { Metadata } from "next";
import Script from "next/script";
import { ConveysFooter } from "@/components/conveys-footer";
import { ConveysHeader } from "@/components/conveys-header";
import { ConveysHome } from "@/components/conveys-home";

export const metadata: Metadata = {
  title: "Web Development & Design Company in Mumbai",
  description:
    "High-performance web development, mobile apps, WhatsApp CRM, and AI solutions for Indian businesses. In-house team in Mumbai. Fixed pricing. Get a free quote.",
  alternates: {
    canonical: "https://conveys.in",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "Conveys Information Technology",
  url: "https://conveys.in",
  telephone: "+919907072035",
  email: "info@conveys.in",
  description:
    "Professional website development, web design, mobile app development, and WhatsApp CRM solutions for businesses across India.",
  address: {
    "@type": "PostalAddress",
    streetAddress: "SwaminarayanCity",
    addressLocality: "Dombivli West",
    addressRegion: "Maharashtra",
    postalCode: "421202",
    addressCountry: "IN",
  },
  geo: {
    "@type": "GeoCoordinates",
    latitude: 19.2,
    longitude: 73.08,
  },
  areaServed: "India",
  priceRange: "$$",
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "IT Services",
    itemListElement: [
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Website Development" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Web Design" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Mobile App Development" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "WhatsApp CRM & Business API" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "AI Solutions & LLM Integration" } },
    ],
  },
};

export default function HomePage(): JSX.Element {
  return (
    <>
      <Script
        id="local-business-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ConveysHeader />
      <ConveysHome />
      <ConveysFooter />
    </>
  );
}
