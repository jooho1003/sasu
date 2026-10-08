import { llmsText } from "@/lib/search-discovery";
import { metadataBase } from "@/lib/site";

export function GET() {
  return new Response(llmsText(metadataBase()), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
