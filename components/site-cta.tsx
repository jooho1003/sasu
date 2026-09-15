import Link from "next/link";

import type { SiteLinks } from "@/lib/site";

type SiteCtaProps = {
  links: SiteLinks;
  compact?: boolean;
  showHome?: boolean;
};

const externalProps = {
  rel: "noreferrer",
  target: "_blank",
} as const;

export function SiteCta({
  links,
  compact = false,
  showHome = false,
}: SiteCtaProps) {
  return (
    <div
      className={`flex flex-wrap items-center gap-3 ${compact ? "text-sm" : ""}`}
    >
      <Link
        className={`button button-primary ${compact ? "button-small" : ""}`}
        href="/demo"
      >
        데모 보기
      </Link>
      {links.pilotContactUrl ? (
        <a
          className={`button button-secondary ${compact ? "button-small" : ""}`}
          href={links.pilotContactUrl}
          {...externalProps}
        >
          파일럿 문의
        </a>
      ) : null}
      {links.voteUrl ? (
        <a
          className="button button-secondary"
          href={links.voteUrl}
          {...externalProps}
        >
          투표하기
        </a>
      ) : null}
      {links.demoVideoUrl ? (
        <a
          className="button button-secondary"
          href={links.demoVideoUrl}
          {...externalProps}
        >
          3분 데모 영상
        </a>
      ) : null}
      {showHome ? (
        <Link className="px-2 py-3 font-bold" href="/">
          사수 알아보기
        </Link>
      ) : null}
    </div>
  );
}
