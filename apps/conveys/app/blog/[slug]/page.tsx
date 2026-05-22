import type { JSX } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConveysHeader } from "@/components/conveys-header";
import { ConveysFooter } from "@/components/conveys-footer";
import { BLOG_POSTS } from "@/app/blog/data/posts";
import type { BlogSection } from "@/app/blog/data/posts";

export function generateStaticParams(): Array<{ slug: string }> {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  if (!post) return {};
  const url = `https://conveys.in/blog/${slug}`;
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description: post.description,
      url,
      type: "article",
      publishedTime: post.publishedAt,
    },
  };
}

function renderSection(section: BlogSection, index: number): JSX.Element {
  switch (section.type) {
    case "h2":
      return (
        <h2 key={index} className="mt-10 text-2xl font-extrabold tracking-tight text-slate-900">
          {section.text}
        </h2>
      );
    case "h3":
      return (
        <h3 key={index} className="mt-6 text-xl font-bold text-slate-900">
          {section.text}
        </h3>
      );
    case "p":
      return (
        <p key={index} className="mt-4 text-base leading-relaxed text-slate-600">
          {section.text}
        </p>
      );
    case "ul":
      return (
        <ul key={index} className="mt-4 space-y-2">
          {(section.items ?? []).map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-base text-slate-600">
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-indigo-500" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      );
  }
}

export default async function BlogPostPage(
  { params }: { params: Promise<{ slug: string }> }
): Promise<JSX.Element> {
  const { slug } = await params;
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  if (!post) notFound();

  const url = `https://conveys.in/blog/${post.slug}`;

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${url}#article`,
    headline: post.title,
    description: post.description,
    url,
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    author: {
      "@type": "Organization",
      "@id": "https://conveys.in/#organization",
      name: "Conveys Information Technology",
    },
    publisher: {
      "@id": "https://conveys.in/#organization",
    },
    about: {
      "@type": "Thing",
      name: post.category,
    },
    isPartOf: {
      "@type": "Blog",
      url: "https://conveys.in/blog",
    },
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: post.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  const formattedDate = new Date(post.publishedAt).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <ConveysHeader />

      <main id="main-content" className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-2 text-sm text-slate-400">
          <Link href="/" className="hover:text-slate-600">Home</Link>
          <span>/</span>
          <Link href="/blog" className="hover:text-slate-600">Blog</Link>
          <span>/</span>
          <span className="text-slate-600">{post.category}</span>
        </nav>

        {/* Header */}
        <header>
          <span className="inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-indigo-600">
            {post.category}
          </span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            {post.title}
          </h1>
          <p className="mt-3 text-sm text-slate-400">
            {formattedDate} · {post.readingTime}
          </p>
        </header>

        {/* Intro */}
        <p className="mt-8 text-lg leading-relaxed text-slate-600 border-l-4 border-indigo-200 pl-5">
          {post.intro}
        </p>

        {/* Body sections */}
        <div className="mt-8">
          {post.sections.map((section, i) => renderSection(section, i))}
        </div>

        {/* FAQ */}
        <section className="mt-16 border-t border-slate-100 pt-12">
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Frequently Asked Questions
          </h2>
          <div className="mt-6 space-y-4">
            {post.faqs.map((faq, i) => (
              <details key={i} className="group rounded-xl border border-slate-200 bg-slate-50 p-5 open:bg-white open:shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold text-slate-900">
                  {faq.question}
                  <svg className="h-4 w-4 flex-shrink-0 text-indigo-500 transition group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Back link */}
        <div className="mt-12 border-t border-slate-100 pt-8">
          <Link href="/blog" className="font-semibold text-indigo-600 hover:text-indigo-700">
            ← Back to Blog
          </Link>
        </div>
      </main>

      <ConveysFooter />
    </>
  );
}
