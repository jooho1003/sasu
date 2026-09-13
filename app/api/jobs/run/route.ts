import { createHash, timingSafeEqual } from "node:crypto";

import { runWorkerOnce } from "@/lib/worker";

export const dynamic = "force-dynamic";

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

  try {
    return Response.json(await runWorkerOnce());
  } catch {
    return Response.json({ error: "worker_failed" }, { status: 500 });
  }
}
