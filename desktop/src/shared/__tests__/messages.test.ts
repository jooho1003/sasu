import { describe, expect, it } from "vitest";
import { message } from "../messages";

describe("message", () => {
  it.each([
    ["network:연결을 확인해 주세요.", "연결을 확인해 주세요."],
    ["Error invoking remote method 'answer:get': Error: network:연결을 확인해 주세요.", "연결을 확인해 주세요."],
    ["Error invoking remote method 'link:create': Error: invalid_input:입력값을 확인해 주세요.", "입력값을 확인해 주세요."],
    ["기록에서 다시 확인해 주세요.", "기록에서 다시 확인해 주세요."],
  ])("removes technical envelopes from %s", (input, expected) => {
    expect(message(new Error(input))).toBe(expected);
  });
  it("uses a Korean fallback for a non-error", () => {
    expect(message(null)).toBe("요청을 처리하지 못했습니다. 잠시 뒤 다시 해 주세요.");
  });
});
