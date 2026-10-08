import type { MetadataRoute } from "next";
import { metadataBase } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: process.env.VERCEL_ENV === "preview" ? { userAgent: "*", disallow: "/" } : {
      userAgent: "*",
      allow: ["/", "/demo", "/privacy"],
      disallow: ["/d/", "/admin", "/api/", "/trailers", "/t/", "/invite/", "/login", "/auth/", "/consent", "/no-membership", "/demo/access"],
    },
    sitemap: new URL("/sitemap.xml", metadataBase()).href,
  };
}
