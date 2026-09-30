// publish_review numbers every nonblank 2,400-character chunk across sections.
// Postgres length/substr count Unicode code points; btrim removes spaces.
export type CitationSection = {
  text: string;
  start_seconds: number | null;
  confidence?: "normal" | "low" | null;
  boundary_review?: boolean;
};

export type ReviewCitationLocation = {
  sectionIndex: number;
  startSeconds: number | null;
  lowConfidence: boolean;
  boundaryReview: boolean;
};

export type ReviewCitationTarget = ReviewCitationLocation & { reviewId: string };

export type PublishedReview = {
  id: string;
  kind: string;
  revision: number;
  published_revision: number | null;
  original_uploaded: boolean;
  original_deleted_at: string | null;
  deleted_at: string | null;
  sections: CitationSection[];
};

export function reviewCitationLocations(sections: CitationSection[]): Map<number, ReviewCitationLocation> {
  const locations = new Map<number, ReviewCitationLocation>();
  let itemIndex = 0;
  sections.forEach((section, sectionIndex) => {
    const characters = Array.from(section.text);
    for (let offset = 0; offset < characters.length; offset += 2400) {
      const chunk = characters.slice(offset, offset + 2400).join("");
      if (chunk.replace(/^ +| +$/gu, "").length === 0) continue;
      locations.set(itemIndex++, {
        sectionIndex,
        startSeconds: section.start_seconds,
        lowConfidence: section.confidence === "low",
        boundaryReview: section.boundary_review === true,
      });
    }
  });
  return locations;
}

export function reviewCitationTarget(externalRef: string | null, review: PublishedReview): ReviewCitationTarget | null {
  if (review.kind !== "audio" || review.revision !== review.published_revision || !review.original_uploaded || review.original_deleted_at || review.deleted_at) return null;
  const match = /^review-section-(0|[1-9]\d*)$/u.exec(externalRef ?? "");
  if (!match) return null;
  const ordinal = Number(match[1]);
  if (!Number.isSafeInteger(ordinal)) return null;
  const location = reviewCitationLocations(review.sections).get(ordinal);
  return location ? { reviewId: review.id, ...location } : null;
}

export function reviewCitationHref(deptId: string, target: ReviewCitationTarget): string {
  return `/d/${encodeURIComponent(deptId)}/reviews/${encodeURIComponent(target.reviewId)}?section=${target.sectionIndex}`;
}
