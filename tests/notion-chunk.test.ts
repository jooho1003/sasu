import { describe, expect, it } from "vitest";
import {
  NOTION_CHUNK_LIMIT,
  chunkNotionBlocks,
  notionPropertyLines,
} from "@/lib/notion-chunk";
import { mask } from "@/lib/mask";
import type { NotionBlock } from "@/lib/notion";

function block(id: string, text: string, type = "paragraph"): NotionBlock {
  return { id, type, [type]: { rich_text: [{ plain_text: text }] } };
}

describe("노션 헤딩 단위 청크", () => {
  it("청크 경계에 걸친 이메일도 마스킹되어 어느 청크에도 원문이 남지 않는다", () => {
    const email = "secret.person@example.com";
    // 공백·마침표 없는 긴 본문이라 길이로 잘린다. 이메일이 정확히 2,400자 경계에 걸치게 한다.
    const text = `${"가".repeat(NOTION_CHUNK_LIMIT - 10)}${email}${"나".repeat(100)}`;
    const chunks = chunkNotionBlocks({ blocks: [block("b1", text)] });
    const joined = chunks.map((chunk) => chunk.content).join("");
    expect(chunks.length).toBeGreaterThan(1);
    expect(joined).not.toContain("secret.person");
    expect(joined).not.toContain("example.com");
  });

  it("헤딩에서 새 청크를 시작하고 블록은 줄바꿈 하나로 잇는다", () => {
    const chunks = chunkNotionBlocks({
      blocks: [
        block("intro", "충분히 긴 도입 문단입니다. 이 문서는 팀의 의사결정 원칙을 설명합니다."),
        block("heading", "비용 원칙", "heading_2"),
        block("detail", "예산 변경은 담당자의 검토와 승인을 거쳐야 합니다."),
      ],
    });

    expect(chunks).toEqual([
      { externalRef: "intro", content: "충분히 긴 도입 문단입니다. 이 문서는 팀의 의사결정 원칙을 설명합니다.\n" },
      { externalRef: "heading", content: "비용 원칙\n예산 변경은 담당자의 검토와 승인을 거쳐야 합니다." },
    ]);
  });

  it("상한을 넘으면 블록 경계에서 나눈다", () => {
    const first = "가".repeat(1_300);
    const second = "나".repeat(1_099);
    const third = "다".repeat(80);
    const chunks = chunkNotionBlocks({
      blocks: [block("first", first), block("second", second), block("third", third)],
    });

    expect(chunks).toEqual([
      { externalRef: "first", content: `${first}\n${second}` },
      { externalRef: "third", content: `\n${third}` },
    ]);
    expect(chunks.every(({ content }) => content.length <= NOTION_CHUNK_LIMIT)).toBe(true);
  });

  it("거대 단일 블록은 문장 경계로 나누고 #n 참조를 붙이며 글자를 보존한다", () => {
    const original = `${"첫 문장입니다. ".repeat(300)}${"끝".repeat(400)}`;
    const chunks = chunkNotionBlocks({ blocks: [block("giant", original)] });

    expect(chunks.map(({ externalRef }) => externalRef)).toEqual(["giant", "giant#2"]);
    expect(chunks.every(({ content }) => content.length <= NOTION_CHUNK_LIMIT)).toBe(true);
    expect(chunks.map(({ content }) => content).join("")).toBe(mask(original));
  });

  it("외부 참조는 유일하고 동일 입력에서 안정적이며 중간 청크 수정에도 유지된다", () => {
    const base = [
      block("one", "첫 번째 청크는 충분히 긴 내용을 담아야 합니다. 팀의 기준을 설명합니다."),
      block("two", "두 번째 청크도 충분히 긴 내용을 담아야 합니다. 변경 전 내용입니다."),
      block("three", "세 번째 청크도 충분히 긴 내용을 담아야 합니다. 마지막 내용입니다."),
    ];
    const initial = chunkNotionBlocks({ blocks: base });
    const changed = chunkNotionBlocks({
      blocks: [...base.slice(0, 1), block("two", "두 번째 청크의 내용만 수정합니다. 그래도 참조는 변하지 않아야 합니다."), ...base.slice(2)],
    });

    expect(new Set(initial.map(({ externalRef }) => externalRef)).size).toBe(initial.length);
    expect(chunkNotionBlocks({ blocks: base })).toEqual(initial);
    expect(changed.map(({ externalRef }) => externalRef)).toEqual(initial.map(({ externalRef }) => externalRef));
  });

  it("허용한 데이터베이스 속성만 안정된 속성: 값 줄로 만든다", () => {
    const properties = {
      제목: { type: "title", title: [{ plain_text: "운영 원칙" }] },
      설명: { type: "rich_text", rich_text: [{ plain_text: "승인 절차" }] },
      상태: { type: "status", status: { name: "진행" } },
      우선순위: { type: "select", select: { name: "높음" } },
      태그: { type: "multi_select", multi_select: [{ name: "보안" }, { name: "운영" }] },
      기간: { type: "date", date: { start: "2026-09-18", end: "2026-09-20" } },
      점수: { type: "number", number: 0 },
      공개: { type: "checkbox", checkbox: false },
      링크: { type: "url", url: "https://example.com" },
      담당자: { type: "people", people: [{ name: "홍길동" }] },
      만든이: { type: "created_by", created_by: { name: "홍길동" } },
      메일: { type: "email", email: "person@example.com" },
      관계: { type: "relation", relation: [{ id: "other" }] },
      계산: { type: "formula", formula: { string: "비공개" } },
      파일: { type: "files", files: [{ name: "비공개.pdf" }] },
    };

    expect(notionPropertyLines(properties)).toEqual([
      "제목: 운영 원칙",
      "설명: 승인 절차",
      "상태: 진행",
      "우선순위: 높음",
      "태그: 보안, 운영",
      "기간: 2026-09-18 ~ 2026-09-20",
      "점수: 0",
      "공개: false",
      "링크: https://example.com",
    ]);
    expect(chunkNotionBlocks({ blocks: [block("body", "이 본문은 속성을 함께 저장할 만큼 충분히 긴 문장입니다. 팀의 공통 원칙입니다.")], properties })[0]?.content)
      .toContain("제목: 운영 원칙\n설명: 승인 절차");
  });

  it("40자 미만 본문은 속성이 있어도 제외하고 이메일과 전화번호는 마스킹한다", () => {
    expect(chunkNotionBlocks({
      blocks: [block("short", "짧은 본문입니다.")],
      properties: { 제목: { type: "title", title: [{ plain_text: "속성만으로는 부족" }] } },
    })).toEqual([]);

    const chunks = chunkNotionBlocks({
      blocks: [block("private", "문의는 person@example.com 또는 010-1234-5678로 남기고 충분한 내용을 작성합니다.")],
    });
    expect(chunks[0]?.content).toContain("[이메일]");
    expect(chunks[0]?.content).toContain("[전화번호]");
    expect(chunks[0]?.content).not.toContain("person@example.com");
    expect(chunks[0]?.content).not.toContain("010-1234-5678");
  });
});
