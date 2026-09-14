import type { Metadata } from "next";
import { Gothic_A1, Hahmlet, IBM_Plex_Mono } from "next/font/google";

import { metadataBase } from "@/lib/site";

import "./globals.css";

const headingFont = Hahmlet({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-heading",
  fallback: ["system-ui", "Arial", "sans-serif"],
});

const bodyFont = Gothic_A1({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-body",
  fallback: ["system-ui", "Arial", "sans-serif"],
});

const metaFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-meta",
  fallback: ["ui-monospace", "SFMono-Regular", "monospace"],
});

export const metadata: Metadata = {
  metadataBase: metadataBase(),
  title: {
    default: "사수 — 회의록이 아니라 결정을 만듭니다",
    template: "%s | 사수",
  },
  description:
    "슬랙과 회의에 묻힌 결정 요청을 담당자에게 보내고, 내려진 결정을 근거와 함께 부서 원장에 남기는 AI 사수.",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "사수",
    title: "사수 — 회의록이 아니라 결정을 만듭니다",
    description: "부서별 결정 요청, 결정 원장, 권한 인지 Q&A를 하나로 연결합니다.",
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: "사수 — 부서별 결정 사수 AI" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "사수 — 회의록이 아니라 결정을 만듭니다",
    description: "부서별 결정 요청, 결정 원장, 권한 인지 Q&A를 하나로 연결합니다.",
    images: ["/opengraph-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${headingFont.variable} ${bodyFont.variable} ${metaFont.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
