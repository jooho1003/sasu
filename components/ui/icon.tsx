import type { CSSProperties } from "react";

const paths = {
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  book: "M5 3h14v18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 14h14M8 7h7M8 11h5",
  chat: "M21 11a8 8 0 0 1-8 8H8l-5 3V5a2 2 0 0 1 2-2h8a8 8 0 0 1 8 8ZM7 8h9M7 12h6",
  file: "M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 12h8M8 16h5",
  people:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  settings: "M4 7h16M4 17h16M8 4v6M16 14v6",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  chevron: "m9 5 7 7-7 7",
  check: "m5 12 4 4L19 6",
  lock: "M6 10h12v11H6V10Zm3 0V6a3 3 0 0 1 6 0v4m-3 5v2",
  hash: "M5 9h15M4 15h15M11 3 7 21M17 3l-4 18",
  video: "M3 5h12v14H3V5Zm12 5 6-4v12l-6-4",
  code: "m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18",
  pen: "m14 4 6 6M3 21l5-1L21 7l-6-6L2 14l1 7Z",
  clock: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  briefcase: "M3 7h18v14H3V7Zm5 0V3h8v4M3 12a23 23 0 0 0 18 0M12 11v4",
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 20,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}

export function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <span
      className={`brand-mark ${small ? "brand-mark-small" : ""}`}
      aria-hidden="true"
    >
      <Icon name="spark" size={small ? 17 : 22} />
    </span>
  );
}
