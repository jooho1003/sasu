import { expect, it } from "vitest";
import { retroError } from "@/lib/retro/errors";
it("오류 원문은 응답으로 전달하지 않는다", () => {
  expect(retroError({ message: "stale_retro" })).toMatchObject({ code: "stale_retro", status: 409 });
  expect(retroError({ message: "secret@example.com" })).toMatchObject({ code: "unknown", status: 500 });
  expect(JSON.stringify(retroError({ message: "secret@example.com" }))).not.toContain("secret");
});
