import type { JSX } from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ConveysHeader } from "@/components/conveys-header"
import { ConveysFooter } from "@/components/conveys-footer"
import { LOCATIONS } from "@/lib/locations-data"
import { getService } from "@/lib/services-data"

type Props = { params: Promise<{ city: string }> }

export function generateStaticParams(): { city: string }[] {
  return LOCATIONS.map((l) => ({ city: l.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city } = await params
  const location = LOCATIONS.find((l) => l.slug === city)
  if (!location) return {}
  return {
    title: location.metaTitle,
    description: location.metaDescription,
    alternates: { canonical: `https://conveys.in/locations/${location.slug}` },
    openGraph: { url: `https://conveys.in/locations/${location.slug}` },
  }
}

export default async function CityPage({ params }: Props): Promise<JSX.Element> {
  const { city } = await params
  const location = LOCATIONS.find((l) => l.slug === city)
  if (!location) notFound()

  const services = location.featuredServiceSlugs
    .map((slug) => {
      try {
        return getService(slug)
      } catch {
        return null
      }
    })
    .filter(Boolean)

  return (
    <>
      <ConveysHeader />
      <main className="bg-white">
        {/* Hero */}
        <section className="bg-gray-50 px-6 py-16">
          <div className="mx-auto max-w-4xl">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              {location.headline}
            </h1>
            <p className="mt-4 text-lg text-gray-600">{location.intro}</p>
            <Link
              href="/about#contact"
              className="mt-6 inline-flex items-center rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700"
            >
              Get a Free Consultation
            </Link>
          </div>
        </section>

        {/* Featured Services */}
        <section className="mx-auto max-w-5xl px-6 py-14">
          <h2 className="text-2xl font-bold text-gray-900">
            Our Services in {location.city}
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map(
              (service) =>
                service && (
                  <Link
                    key={service.slug}
                    href={`/services/${service.slug}`}
                    className="block rounded-lg border border-gray-200 p-5 transition-all hover:border-green-500 hover:shadow-sm"
                  >
                    <p className="font-semibold text-gray-900">{service.title}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-gray-500">
                      {service.tagline}
                    </p>
                  </Link>
                ),
            )}
          </div>
        </section>

        {/* Why Conveys */}
        <section className="bg-gray-50 px-6 py-14">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-2xl font-bold text-gray-900">
              Why Businesses in {location.city} Choose Conveys
            </h2>
            <ul className="mt-6 space-y-3">
              {[
                "In-house team only — no outsourcing, no handoffs to unknown subcontractors",
                "Fixed pricing — you know the total cost before we start",
                "You own the IP — all code, designs, and documentation are yours at completion",
              ].map((point) => (
                <li key={point} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">
                    ✓
                  </span>
                  <span className="text-gray-700">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA */}
        <section className="px-6 py-14">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-gray-900">
              Ready to start your project?
            </h2>
            <p className="mt-3 text-gray-600">
              Tell us what you are building and we will come back with a
              fixed-price quote within 48 hours.
            </p>
            <Link
              href="/about#contact"
              className="mt-6 inline-flex items-center rounded-lg bg-green-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-700"
            >
              Get a Free Consultation
            </Link>
          </div>
        </section>
      </main>
      <ConveysFooter />
    </>
  )
}
