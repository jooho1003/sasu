import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: ({ children, href }: { children: ReactNode; href: string }) => createElement("a", { href }, children) };
});

import { MeetingRecorder } from "@/components/meeting-recorder";

it("Node navigator가 있어도 서버 HTML에 브라우저 미지원 경고를 렌더하지 않는다", () => {
  expect(typeof navigator).toBe("object");
  expect(navigator.mediaDevices).toBeUndefined();
  const html = renderToString(createElement(MeetingRecorder, { deptId: "dept", userId: "user" }));
  expect(html).toContain("브라우저 기능을 확인하고 있습니다.");
  expect(html).not.toContain("최신 크롬이나 엣지 브라우저에서 열어 주세요.");
});
