import type { MetadataRoute } from "next";

const BASE_URL = "https://wbmsg.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/docs/", "/sign-up", "/sign-in"],
        disallow: ["/dashboard/", "/admin/", "/api/", "/onboarding/", "/setup/"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
