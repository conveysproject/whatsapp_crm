import Link from "next/link";
import type { JSX } from "react";
import type { Metadata } from "next";
import { ConveysFooter } from "@/components/conveys-footer";
import { ConveysHeader } from "@/components/conveys-header";

export const metadata: Metadata = {
  title: "Blog — Web Development Insights & Case Studies",
  description: "Updates, case studies, and product launches from Conveys Information Technology — web development, mobile apps, and WhatsApp CRM for Indian businesses.",
  alternates: { canonical: "https://conveys.in/blog" },
  openGraph: { url: "https://conveys.in/blog" },
};

const POSTS = [
  { title: "Bulk and price", date: "May 4, 2026" },
  { title: "Silver pearl", date: "May 2, 2026" },
  { title: "Resolute property", date: "May 1, 2026" },
  { title: "Big growth", date: "April 27, 2026" },
  { title: "MI Studio Salon", date: "April 14, 2026" },
  { title: "Supreme Kesari Tea", date: "April 11, 2026" },
] as const;

export default function BlogPage(): JSX.Element {
  return (
    <>
      <ConveysHeader />
      <main id="main-content" className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Blog</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Latest posts</h1>
        <p className="mt-3 text-slate-600">Insights, case studies, and updates from our team.</p>
        <ul className="mt-10 divide-y divide-slate-100 border-t border-slate-100">
          {POSTS.map((post) => (
            <li key={post.title} className="py-6">
              <Link href="/blog" className="group block">
                <h2 className="text-xl font-bold capitalize text-slate-900 group-hover:text-indigo-700">{post.title}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {post.date} · No comments
                </p>
                <span className="mt-2 inline-block text-sm font-semibold text-indigo-600">Read more →</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-10">
          <Link href="/" className="font-semibold text-indigo-600 hover:text-indigo-700">
            ← Back to home
          </Link>
        </p>
      </main>
      <ConveysFooter />
    </>
  );
}
