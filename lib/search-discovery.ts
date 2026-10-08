// Design Ref: search-observability §7 — only public product facts are discoverable.
import type { Metadata } from "next";
export type Environment = Readonly<Record<string, string | undefined>>;
export const publicPaths = ["/", "/demo", "/privacy"] as const;
export const publicFaq = [
  { question: "사수는 어떤 서비스인가요?", answer: "사수는 슬랙·회의·문서에서 결정할 일을 찾고, 담당자의 결정과 이유를 부서 결정 기록에 남기며, 팀의 질문에 원문 근거로 답하는 인공지능 동료입니다." },
  { question: "사수가 결정을 대신 내리나요?", answer: "아니요. 사수는 배경과 근거가 있는 결정 요청을 정리합니다. 담당자가 직접 결정하고 그 이유를 기록합니다." },
  { question: "어떤 자료를 연결할 수 있나요?", answer: "슬랙 채널과 노션 페이지를 연결하고, 회의 받아쓴 글·음성 파일·문서를 업로드할 수 있습니다. 조직의 녹음 설정과 참여자 동의가 준비된 경우 웹 녹음도 사용할 수 있습니다." },
  { question: "우리 팀의 자료는 누구에게 보이나요?", answer: "부서와 사용자 권한에 따라 접근을 제한합니다. 질문자는 자신이 볼 수 있는 기록만 근거로 답변을 받습니다. 동의하지 않은 구성원의 발언은 저장하지 않습니다." },
  { question: "가입 없이 사수를 체험할 수 있나요?", answer: "네. 공개 체험은 가상 회사 자료로 준비되어 있습니다. 가입 없이 결정 카드·결정 기록·부서별 답변을 확인할 수 있습니다." },
] as const;

export function isIndexable(pathname: string, env: Environment = process.env): boolean {
  return env.VERCEL_ENV !== "preview" && publicPaths.some((path) => path === pathname);
}

export function publicMetadata(pathname: string, title: string, description: string): Metadata {
  return {
    title, description, alternates: { canonical: pathname },
    robots: { index: isIndexable(pathname), follow: isIndexable(pathname), googleBot: { index: isIndexable(pathname), follow: isIndexable(pathname), "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
    openGraph: { type: "website", locale: "ko_KR", siteName: "사수", url: pathname, title, description, images: [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: "사수 — 부서별 결정 사수 인공지능" }] },
    twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image.png"] },
  };
}

export function structuredData(base: URL) {
  const home = new URL("/", base).href;
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${home}#organization`, name: "사수", alternateName: "SASU", url: home, logo: new URL("/icon.svg", base).href },
      { "@type": "WebSite", "@id": `${home}#website`, name: "사수", alternateName: "SASU", url: home, inLanguage: "ko-KR", publisher: { "@id": `${home}#organization` } },
      { "@type": "SoftwareApplication", "@id": `${home}#application`, name: "사수", alternateName: "SASU", url: home, applicationCategory: "BusinessApplication", operatingSystem: "Web, Windows", description: publicFaq[0].answer, featureList: ["근거가 있는 결정 요청", "부서 결정 기록", "권한에 따른 근거 답변"], publisher: { "@id": `${home}#organization` } },
      { "@type": "FAQPage", "@id": `${home}#faq`, mainEntity: publicFaq.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
    ],
  };
}

export function llmsText(base: URL): string {
  return ["# 사수 (SASU)", "", `> ${publicFaq[0].answer}`, "", "## 공개 페이지", ...publicPaths.map((path, index) => `- [${["제품 소개와 자주 묻는 질문", "가상 회사 체험", "개인정보 처리 안내"][index]}](${new URL(path, base).href})`), "", "## 제품 설명", ...publicFaq.flatMap(({ question, answer }) => ["", `### ${question}`, answer]), "", "## 자료 경계", "이 문서는 공개 제품 정보입니다. 공개 체험은 가상 회사 자료입니다. 업무 자료·지원자 정보·로그인 링크는 공개 자료가 아닙니다.", ""].join("\n");
}
