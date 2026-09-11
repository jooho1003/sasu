import { describe, expect, it } from "vitest";

import {
  chunkDocumentText,
  normalizeDocumentText,
  supportedDocumentExtension,
  validateDocumentUpload,
} from "@/lib/adapters/document";

describe("document adapter", () => {
  it("normalizes line endings, whitespace, and BOM without changing words", () => {
    expect(normalizeDocumentText("\uFEFF  첫 줄  \r\n\r\n 둘째   줄 ")).toBe(
      "첫 줄\n\n둘째 줄",
    );
  });

  it("chunks a document at line boundaries and keeps every character", () => {
    const text = "첫 번째 문단입니다.\n둘째 문단입니다.\n셋째 문단입니다.";
    const chunks = chunkDocumentText(text, 16);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("\n")).toContain("첫 번째 문단입니다.");
    expect(chunks.join("\n")).toContain("둘째 문단입니다.");
    expect(chunks.join("\n")).toContain("셋째 문단입니다.");
    expect(chunks.every((chunk) => chunk.length <= 16)).toBe(true);
  });

  it("accepts text, markdown, csv, json, pdf, and docx files", () => {
    for (const filename of ["notes.txt", "guide.md", "rows.csv", "data.json", "brief.pdf", "brief.docx"]) {
      expect(supportedDocumentExtension(filename)).toBe(true);
      expect(validateDocumentUpload({ filename, mimeType: "", size: 1 }).ok).toBe(true);
    }
  });

  it("rejects executable extensions and oversized files", () => {
    expect(validateDocumentUpload({ filename: "payload.exe", mimeType: "application/octet-stream", size: 1 }).ok).toBe(false);
    const result = validateDocumentUpload({ filename: "large.pdf", mimeType: "application/pdf", size: 21 * 1024 * 1024 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("document_too_large");
  });
});
