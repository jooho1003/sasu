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
      <a
        className={`button button-primary ${compact ? "button-small" : ""}`}
        href="/demo"
        data-analytics-id="demo"
      >
        데모 보기
      </a>
      {links.pilotContactUrl ? (
        <a
          className={`button button-secondary ${compact ? "button-small" : ""}`}
          href={links.pilotContactUrl}
          data-analytics-id="pilot_contact"
          {...externalProps}
        >
          파일럿 문의
        </a>
      ) : null}
      {links.voteUrl ? (
        <a
          className="button button-secondary"
          href={links.voteUrl}
          data-analytics-id="vote"
          {...externalProps}
        >
          투표하기
        </a>
      ) : null}
      {links.demoVideoUrl ? (
        <a
          className="button button-secondary"
          href={links.demoVideoUrl}
          data-analytics-id="demo_video"
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
