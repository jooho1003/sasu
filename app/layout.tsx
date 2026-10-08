import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import { connection } from "next/server";
import { headers } from "next/headers";
import { PublicAnalytics } from "@/components/public-analytics";
import { analyticsId, telemetryEnabled } from "@/lib/telemetry";

import { metadataBase } from "@/lib/site";

import "./globals.css";

const bodyFont = Noto_Sans_KR({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body",
  fallback: ["system-ui", "Arial", "sans-serif"],
});

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  applicationName: "사수",
  metadataBase: metadataBase(),
  title: {
    default: "사수 — 회의록이 아니라 결정을 만듭니다",
    template: "%s | 사수",
  },
  description:
    "슬랙과 회의에 묻힌 결정 요청을 담당자에게 보내고, 내려진 결정을 근거와 함께 부서 결정 기록에 남기는 인공지능 사수.",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "사수",
    title: "사수 — 회의록이 아니라 결정을 만듭니다",
    description:
      "부서별 결정 요청, 결정 기록, 권한 인지 Q&A를 하나로 연결합니다.",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "사수 — 부서별 결정 사수 인공지능",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "사수 — 회의록이 아니라 결정을 만듭니다",
    description:
      "부서별 결정 요청, 결정 기록, 권한 인지 Q&A를 하나로 연결합니다.",
    images: ["/opengraph-image.png"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // CSP nonces belong to one request, including public/demo and not-found HTML.
  // Unlike force-dynamic, this does not change explicit data-cache policies.
  await connection();
  const measurementId = telemetryEnabled() ? analyticsId(process.env.GA4_MEASUREMENT_ID) : null;
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="ko" className={bodyFont.variable} data-scroll-behavior="smooth">
      <body>{children}{measurementId ? <PublicAnalytics measurementId={measurementId} nonce={nonce} baseUrl={metadataBase().href} /> : null}</body>
    </html>
  );
}
