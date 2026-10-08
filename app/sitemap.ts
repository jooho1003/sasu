import type { MetadataRoute } from "next";

import { metadataBase } from "@/lib/site";
import { publicPaths } from "@/lib/search-discovery";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = metadataBase();
  if (process.env.VERCEL_ENV === "preview") return [];
  return publicPaths.map((pathname) => ({
    url: new URL(pathname, base).href,
    changeFrequency: pathname === "/" ? "weekly" : "monthly",
    priority: pathname === "/" ? 1 : 0.7,
  }));
}
