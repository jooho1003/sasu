import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/demo", "/privacy"],
      disallow: ["/d/", "/admin", "/api/", "/trailers", "/t/", "/invite/"],
    },
    sitemap: "/sitemap.xml",
  };
}
