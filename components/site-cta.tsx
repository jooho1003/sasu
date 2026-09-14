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

export function SiteCta({ links, compact = false, showHome = false }: SiteCtaProps) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${compact ? "text-sm" : ""}`}>
      <Link
        className="rounded-full bg-[var(--accent)] px-5 py-3 font-bold text-white no-underline transition hover:-translate-y-0.5"
        href="/demo"
      >
        데모 보기
      </Link>
      {links.pilotContactUrl ? (
        <a
          className="rounded-full border border-[var(--accent)] px-5 py-3 font-bold no-underline"
          href={links.pilotContactUrl}
          {...externalProps}
        >
          파일럿 문의
        </a>
      ) : null}
      {links.voteUrl ? (
        <a className="rounded-full border border-black/15 px-5 py-3 font-bold no-underline" href={links.voteUrl} {...externalProps}>
          투표하기
        </a>
      ) : null}
      {links.demoVideoUrl ? (
        <a className="rounded-full border border-black/15 px-5 py-3 font-bold no-underline" href={links.demoVideoUrl} {...externalProps}>
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
