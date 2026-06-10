import type { JSX } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { ConveysHeader } from "@/components/conveys-header"
import { ConveysFooter } from "@/components/conveys-footer"
import { LOCATIONS } from "@/lib/locations-data"

export const metadata: Metadata = {
  title: "IT Services & Web Development by Location | Conveys",
  description:
    "Conveys delivers web development, mobile apps, cloud infrastructure, and WhatsApp solutions to businesses in London, Sydney, Toronto, Dubai, Singapore, New York, and more.",
  alternates: { canonical: "https://conveys.in/locations" },
  openGraph: { url: "https://conveys.in/locations" },
}

export default function LocationsPage(): JSX.Element {
  return (
    <>
      <ConveysHeader />
      <main className="bg-white">
        <section className="mx-auto max-w-5xl px-6 py-16">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            IT Services &amp; Web Development by Location
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            Conveys works with businesses across the UK, Australia, Canada, UAE,
            Singapore, and the USA. Choose your location to see how we serve your
            market.
          </p>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {LOCATIONS.map((location) => (
              <li key={location.slug}>
                <Link
                  href={`/locations/${location.slug}`}
                  className="block rounded-lg border border-gray-200 p-5 transition-all hover:border-green-500 hover:shadow-sm"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    {location.country}
                  </p>
                  <p className="mt-1 text-base font-semibold text-gray-900">
                    {location.city}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <ConveysFooter />
    </>
  )
}
