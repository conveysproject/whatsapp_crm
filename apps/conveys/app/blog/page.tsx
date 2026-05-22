import Link from "next/link";
import type { JSX } from "react";
import type { Metadata } from "next";
import { ConveysFooter } from "@/components/conveys-footer";
import { ConveysHeader } from "@/components/conveys-header";
import { BLOG_POSTS } from "@/app/blog/data/posts";

export const metadata: Metadata = {
  title: "Blog — Web Development Insights & Case Studies",
  description: "Guides, comparisons, and insights on WhatsApp Business API, web development, mobile apps, AI integration, and SaaS development for Indian businesses.",
  alternates: { canonical: "https://conveys.in/blog" },
  openGraph: { url: "https://conveys.in/blog" },
};

export default function BlogPage(): JSX.Element {
  return (
    <>
      <ConveysHeader />
      <main id="main-content" className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Blog</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Latest posts</h1>
        <p className="mt-3 text-slate-600">Practical guides on WhatsApp API, web development, mobile apps, and AI for Indian businesses.</p>
        <ul className="mt-10 divide-y divide-slate-100 border-t border-slate-100">
          {BLOG_POSTS.map((post) => (
            <li key={post.slug} className="py-6">
              <Link href={`/blog/${post.slug}`} className="group block">
                <span className="text-xs font-semibold uppercase tracking-wide text-indigo-500">{post.category}</span>
                <h2 className="mt-1 text-xl font-bold text-slate-900 group-hover:text-indigo-700">{post.title}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {new Date(post.publishedAt).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })} · {post.readingTime}
                </p>
                <p className="mt-2 text-sm text-slate-600 line-clamp-2">{post.description}</p>
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
