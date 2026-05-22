import type { MetadataRoute } from "next";
import { BLOG_SLUGS } from "@/app/blog/data/posts";

const SERVICE_SLUGS = [
  // Cloud Services
  "site-migration",
  "cloud-infrastructure-setup",
  "whatsapp-business-api",
  "cloud-architecture-review",
  "devops-cicd",
  "database-administration",
  // IT Software Consultancy
  "mobile-app-development",
  "native-app-development",
  "custom-software-development",
  "cross-platform-development",
  "iot-development",
  "ui-ux-design",
  "frontend-development",
  "backend-development",
  "web-development",
  // Digital & IT Solutions
  "digital-transformation",
  "managed-it-services",
  "digital-marketing",
  "whatsapp-marketing-automation",
  "crm-integration",
  "managed-service-provider",
  "whatsapp-crm",
  "ai-solutions",
  // Product Development
  "saas-product-development",
  "mvp-development",
  "api-integration-development",
  "ecommerce-solutions",
  "b2b-platform-design",
  "whatsapp-commerce",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://conveys.in";
  return [
    { url: base, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${base}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/portfolio`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    ...SERVICE_SLUGS.map((slug) => ({
      url: `${base}/services/${slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    { url: `${base}/blog`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
    ...BLOG_SLUGS.map((slug) => ({
      url: `${base}/blog/${slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: `${base}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/cancellation`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
  ];
}
