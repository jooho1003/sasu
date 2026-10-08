import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/(site)/page";
import { SiteFooter, SiteHeader } from "@/components/site-shell";
import { siteLinks } from "@/lib/site";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-nonce": "test-nonce" }) }));

afterEach(() => vi.unstubAllEnvs());

describe("공개 노션 사용 가이드", () => {
  it("PC·모바일 메뉴, 본문, 푸터에 안전한 새 탭 링크를 제공한다", async () => {
    const url = "https://example.com/sasu-guide";
    vi.stubEnv("SASU_GUIDE_URL", url);
    const links = siteLinks();
    const header = renderToStaticMarkup(createElement(SiteHeader, { links }));
    const footer = renderToStaticMarkup(createElement(SiteFooter, { links }));
    const home = renderToStaticMarkup(await HomePage());
    expect(header.match(/사용 가이드/g)).toHaveLength(2);
    expect(footer).toContain("사용 가이드");
    expect(home).toContain('id="guide-title"');
    expect(home).toContain("노션 가이드 보기");
    for (const html of [header, footer, home]) {
      const anchors = html.match(/<a\b[^>]*href="https:\/\/example.com\/sasu-guide"[^>]*>/g);
      expect(anchors?.length).toBeGreaterThan(0);
      for (const anchor of anchors ?? []) {
        expect(anchor).toContain('target="_blank"');
        expect(anchor).toContain('rel="noopener noreferrer"');
      }
      expect(html).toContain("새 탭");
    }
  });

  it.each(["", "javascript:alert(1)"])("가이드 미설정·잘못된 주소에서는 안내와 링크를 숨긴다: %s", async (url) => {
    vi.stubEnv("SASU_GUIDE_URL", url);
    const links = siteLinks();
    expect(renderToStaticMarkup(createElement(SiteHeader, { links }))).not.toContain("사용 가이드");
    expect(renderToStaticMarkup(createElement(SiteFooter, { links }))).not.toContain("사용 가이드");
    expect(renderToStaticMarkup(await HomePage())).not.toContain('id="guide"');
  });
});
