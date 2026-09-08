import { createHmac, timingSafeEqual } from "node:crypto";

const SLACK_SIGNATURE_VERSION = "v0";
const MAX_TIMESTAMP_SKEW_SECONDS = 5 * 60;

export function verifySlackSignature(args: {
  rawBody: string;
  timestamp: string;
  signature: string;
  signingSecret: string;
  now?: Date;
}): boolean {
  const timestampSeconds = Number(args.timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return false;
  }

  const nowSeconds = Math.floor((args.now ?? new Date()).getTime() / 1_000);
  if (Math.abs(nowSeconds - timestampSeconds) > MAX_TIMESTAMP_SKEW_SECONDS) {
    return false;
  }

  const digest = createHmac("sha256", args.signingSecret)
    .update(
      `${SLACK_SIGNATURE_VERSION}:${args.timestamp}:${args.rawBody}`,
      "utf8",
    )
    .digest("hex");
  const expected = Buffer.from(`${SLACK_SIGNATURE_VERSION}=${digest}`, "utf8");
  const received = Buffer.from(args.signature, "utf8");

  if (expected.length !== received.length) {
    return false;
  }

  return timingSafeEqual(expected, received);
}
