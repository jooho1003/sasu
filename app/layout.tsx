import type { Metadata } from "next";
import { Gothic_A1, Hahmlet, IBM_Plex_Mono } from "next/font/google";

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
  title: "사수",
  description: "부서별 결정 사수 AI",
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
