import { describe, it, expect } from "vitest";
import { BLOG_POSTS } from "./posts";

const GLOBAL_SLUGS = [
  "whatsapp-crm-for-small-business",
  "saas-product-development-cost-timeline",
  "cross-platform-vs-native-app-development",
];

describe("BLOG_POSTS", () => {
  it("all posts have required fields", () => {
    for (const post of BLOG_POSTS) {
      expect(post.slug, `${post.slug}: missing slug`).toBeTruthy();
      expect(post.title, `${post.slug}: missing title`).toBeTruthy();
      expect(post.description, `${post.slug}: missing description`).toBeTruthy();
      expect(post.publishedAt, `${post.slug}: missing publishedAt`).toBeTruthy();
      expect(post.sections.length, `${post.slug}: no sections`).toBeGreaterThan(0);
      expect(post.faqs.length, `${post.slug}: no FAQs`).toBeGreaterThanOrEqual(3);
    }
  });

  it("global posts exist with no 'india' in slug or description", () => {
    for (const slug of GLOBAL_SLUGS) {
      const post = BLOG_POSTS.find((p) => p.slug === slug);
      expect(post, `post '${slug}' not found`).toBeDefined();
      expect(post!.slug.toLowerCase()).not.toContain("india");
      expect(post!.description.toLowerCase()).not.toContain("india");
    }
  });

  it("has at least 8 posts total", () => {
    expect(BLOG_POSTS.length).toBeGreaterThanOrEqual(8);
  });
});
