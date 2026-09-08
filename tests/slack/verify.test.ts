import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifySlackSignature } from "@/lib/slack/verify";

const signingSecret = "test-signing-secret";
const now = new Date("2026-09-08T12:00:00.000Z");

function sign(rawBody: string, timestamp: string): string {
  return `v0=${createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest("hex")}`;
}

describe("verifySlackSignature", () => {
  it("5분보다 오래된 타임스탬프의 요청을 거부한다", () => {
    const rawBody = JSON.stringify({ type: "event_callback" });
    const timestamp = String(now.getTime() / 1_000 - 301);

    expect(
      verifySlackSignature({
        rawBody,
        timestamp,
        signature: sign(rawBody, timestamp),
        signingSecret,
        now,
      }),
    ).toBe(false);
  });

  it("서명이 한 글자 다르면 거부한다", () => {
    const rawBody = JSON.stringify({ type: "event_callback" });
    const timestamp = String(now.getTime() / 1_000);
    const validSignature = sign(rawBody, timestamp);
    const signature = `${validSignature.slice(0, -1)}${validSignature.endsWith("0") ? "1" : "0"}`;

    expect(
      verifySlackSignature({
        rawBody,
        timestamp,
        signature,
        signingSecret,
        now,
      }),
    ).toBe(false);
  });

  it("올바른 서명을 통과시킨다", () => {
    const rawBody = JSON.stringify({ type: "event_callback" });
    const timestamp = String(now.getTime() / 1_000);

    expect(
      verifySlackSignature({
        rawBody,
        timestamp,
        signature: sign(rawBody, timestamp),
        signingSecret,
        now,
      }),
    ).toBe(true);
  });
});
