import { describe, expect, it } from "vitest";

import {
  legacyHostRedirect,
  metadataBase,
  siteLinks,
  trailerDemoHref,
} from "@/lib/site";

describe("사이트 링크 환경 변수", () => {
  it("노션 공개 가이드 주소를 공백 제거 후 연결한다", () => {
    expect(siteLinks({ SASU_GUIDE_URL: " https://sasu.notion.site/guide " }))
      .toHaveProperty("guideUrl", "https://sasu.notion.site/guide");
  });

  it("별도 설정이 없으면 공개 열람을 확인한 사용자 가이드를 연결한다", () => {
    expect(siteLinks({}).guideUrl).toBe(
      "https://app.notion.com/p/SASU-3ddd12f23255809985bfd98b97ce51c9",
    );
  });

  it.each(["", "  ", "javascript:alert(1)", "http://example.com", "/guide", "mailto:guide@example.com"])(
    "명시적으로 비웠거나 안전하지 않은 가이드 주소를 숨긴다: %s",
    (url) => {
      expect(siteLinks({ SASU_GUIDE_URL: url })).toHaveProperty("guideUrl", null);
    },
  );

  it("허용된 https와 mailto 링크만 노출한다", () => {
    expect(
      siteLinks({
        SASU_PILOT_CONTACT_URL: "mailto:pilot@example.com",
        SASU_DEMO_VIDEO_URL: "https://video.example.com/demo",
        SASU_VOTE_URL: "https://vote.example.com/sasu",
      }),
    ).toMatchObject({
      pilotContactUrl: "mailto:pilot@example.com",
      demoVideoUrl: "https://video.example.com/demo",
      voteUrl: "https://vote.example.com/sasu",
    });
  });

  it.each([
    "javascript:alert(1)",
    "http://insecure.example.com",
    "/internal-path",
    "not a url",
    "",
  ])("잘못된 외부 링크를 숨긴다: %s", (unsafeUrl) => {
    expect(
      siteLinks({
        SASU_PILOT_CONTACT_URL: unsafeUrl,
        SASU_DEMO_VIDEO_URL: unsafeUrl,
        SASU_VOTE_URL: unsafeUrl,
      }),
    ).toMatchObject({
      pilotContactUrl: null,
      demoVideoUrl: null,
      voteUrl: null,
    });
  });

  it("문의 링크만 mailto를 허용한다", () => {
    const links = siteLinks({
      SASU_DEMO_VIDEO_URL: "mailto:video@example.com",
      SASU_VOTE_URL: "mailto:vote@example.com",
    });
    expect(links.demoVideoUrl).toBeNull();
    expect(links.voteUrl).toBeNull();
  });
});

describe("채용 예고편 링크", () => {
  it("발행 데모 경로가 프리뷰보다 우선한다", () => {
    expect(
      trailerDemoHref({
        SASU_TRAILER_DEMO_PATH: "/t/abcdefghijklmnopqrstuv",
        SASU_TRAILER_PUBLISH_ENABLED: "true",
        SASU_TRAILER_PREVIEW_ENABLED: "true",
      }),
    ).toBe("/t/abcdefghijklmnopqrstuv");
  });

  it("발행 플래그 off는 공개 데모 경로를 숨기고 프리뷰로 돌아간다", () => {
    const env = { SASU_TRAILER_DEMO_PATH: "/t/abcdefghijklmnopqrstuv" };
    expect(trailerDemoHref(env)).toBeNull();
    expect(trailerDemoHref({ ...env, SASU_TRAILER_PREVIEW_ENABLED: "true" })).toBe("/trailers");
  });

  it("프리뷰가 명시적으로 켜졌을 때만 합성 체험을 노출한다", () => {
    expect(trailerDemoHref({ SASU_TRAILER_PREVIEW_ENABLED: "true" })).toBe(
      "/trailers",
    );
    expect(trailerDemoHref({ SASU_TRAILER_PREVIEW_ENABLED: "TRUE" })).toBeNull();
    expect(trailerDemoHref({})).toBeNull();
  });

  it.each(["/t", "/t/../admin", "https://evil.example/t/demo", "/trailers"])(
    "허용 범위 밖의 발행 경로를 거부한다: %s",
    (path) => {
      expect(trailerDemoHref({ SASU_TRAILER_DEMO_PATH: path })).toBeNull();
    },
  );
});

describe("메타데이터 기준 URL", () => {
  it("공개 앱 URL을 우선한다", () => {
    expect(
      metadataBase({
        NEXT_PUBLIC_APP_URL: "https://sasu.example.com/path",
        VERCEL_PROJECT_PRODUCTION_URL: "fallback.vercel.app",
      }).href,
    ).toBe("https://sasu.example.com/");
  });

  it("Vercel 호스트에는 https를 붙인다", () => {
    expect(
      metadataBase({ VERCEL_PROJECT_PRODUCTION_URL: "sasu.vercel.app" }).href,
    ).toBe("https://sasu.vercel.app/");
  });

  it("설정이 없거나 안전하지 않으면 로컬 기준 URL로 폴백한다", () => {
    expect(metadataBase({}).href).toBe("http://localhost:3000/");
    expect(metadataBase({ NEXT_PUBLIC_APP_URL: "javascript:alert(1)" }).href).toBe(
      "http://localhost:3000/",
    );
  });
});

describe("옛 호스트 리디렉션", () => {
  const env = { NEXT_PUBLIC_APP_URL: "https://getsasu.com", SASU_LEGACY_HOSTS: "sasu-alpha.vercel.app" };
  const go = (host: string | null, pathname: string, search = "", e: Record<string, string | undefined> = env) =>
    legacyHostRedirect({ host, pathname, search }, e);

  it("목록이 비었거나 미설정이면 null", () => {
    expect(go("sasu-alpha.vercel.app", "/", "", { NEXT_PUBLIC_APP_URL: "https://getsasu.com" })).toBeNull();
    expect(go("sasu-alpha.vercel.app", "/", "", { ...env, SASU_LEGACY_HOSTS: "" })).toBeNull();
  });
  it("목록 호스트의 루트를 정식 주소로 보낸다", () => {
    expect(go("sasu-alpha.vercel.app", "/")).toBe("https://getsasu.com/");
  });
  it("경로와 쿼리를 보존한다", () => {
    expect(go("sasu-alpha.vercel.app", "/demo", "?x=1")).toBe("https://getsasu.com/demo?x=1");
  });
  it.each(["/api", "/api/companion/ask"])("%s 는 이동하지 않는다", (p) => {
    expect(go("sasu-alpha.vercel.app", p)).toBeNull();
  });
  it("/apix 는 이동한다", () => {
    expect(go("sasu-alpha.vercel.app", "/apix")).toBe("https://getsasu.com/apix");
  });
  it("대문자·포트 호스트를 정규화한다", () => {
    expect(go("SASU-Alpha.Vercel.App:443", "/login")).toBe("https://getsasu.com/login");
  });
  it("쉼표 여러 개·공백·잘못된 항목을 처리한다", () => {
    const e = { ...env, SASU_LEGACY_HOSTS: " Old.Example.com , bad host,, https://x.com ,sasu-alpha.vercel.app" };
    expect(go("old.example.com", "/", "", e)).toBe("https://getsasu.com/");
    expect(go("sasu-alpha.vercel.app", "/", "", e)).toBe("https://getsasu.com/");
    expect(go("x.com", "/", "", e)).toBeNull();
    expect(go("bad", "/", "", e)).toBeNull();
  });
  it("목록에 없는 호스트·호스트 없음은 null", () => {
    expect(go("other.example.com", "/")).toBeNull();
    expect(go(null, "/")).toBeNull();
  });
  it("정식 호스트와 같으면 null (루프 방지)", () => {
    expect(go("getsasu.com", "/", "", { ...env, SASU_LEGACY_HOSTS: "getsasu.com" })).toBeNull();
  });
  it("정식 주소가 https가 아니면 null", () => {
    expect(go("sasu-alpha.vercel.app", "/", "", { ...env, NEXT_PUBLIC_APP_URL: "http://getsasu.com" })).toBeNull();
    expect(go("sasu-alpha.vercel.app", "/", "", { SASU_LEGACY_HOSTS: "sasu-alpha.vercel.app" })).toBeNull();
  });
  it.each(["//evil.example/x", "/\\evil.example/x", "/\\/evil.example"])("경로 %s 가 목적지 호스트를 바꾸지 못한다", (p) => {
    const target = new URL(go("sasu-alpha.vercel.app", p, "?a=1") ?? "");
    expect(target.origin).toBe("https://getsasu.com");
    expect(target.search).toBe("?a=1");
  });
});
