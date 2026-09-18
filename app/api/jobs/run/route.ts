import { createHash, timingSafeEqual } from "node:crypto";

import { runWorkerBulk, runWorkerOnce } from "@/lib/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function secretMatches(actual: string | null, expected: string): boolean {
  const actualDigest = createHash("sha256").update(actual ?? "").digest();
  const expectedDigest = createHash("sha256").update(expected).digest();

  return timingSafeEqual(actualDigest, expectedDigest);
}

export async function POST(request: Request) {
  const expectedSecret = process.env.JOBS_TRIGGER_SECRET;
  if (!expectedSecret) {
    return Response.json(
      { error: "jobs_trigger_secret_not_configured" },
      { status: 500 },
    );
  }

  if (!secretMatches(request.headers.get("x-jobs-secret"), expectedSecret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const lane = new URL(request.url).searchParams.get("lane");
  if (lane !== null && lane !== "bulk") {
    return Response.json({ error: "invalid_job_lane" }, { status: 400 });
  }

  try {
    return Response.json(lane === "bulk" ? await runWorkerBulk() : await runWorkerOnce());
  } catch {
    return Response.json({ error: "worker_failed" }, { status: 500 });
  }
}
