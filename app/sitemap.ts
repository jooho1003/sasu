import type { MetadataRoute } from "next";

import { metadataBase } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = metadataBase();
  return ["/", "/demo", "/privacy"].map((pathname) => ({
    url: new URL(pathname, base).href,
    changeFrequency: pathname === "/" ? "weekly" : "monthly",
    priority: pathname === "/" ? 1 : 0.7,
  }));
}
