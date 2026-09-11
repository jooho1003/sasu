const DOCUMENT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "json",
  "pdf",
  "docx",
]);

export const MAX_DOCUMENT_UPLOAD_BYTES = 20 * 1024 * 1024;
export const DOCUMENT_CHUNK_SIZE = 2_400;

export function documentExtension(filename: string): string {
  return filename.toLowerCase().split(".").pop() ?? "";
}

export function supportedDocumentExtension(filename: string): boolean {
  return DOCUMENT_EXTENSIONS.has(documentExtension(filename));
}

export function validateDocumentUpload(args: {
  filename: string;
  mimeType: string;
  size: number;
}): { ok: true } | { ok: false; error: "unsupported_document_format" | "document_too_large" | "document_empty" } {
  if (!supportedDocumentExtension(args.filename)) {
    return { ok: false, error: "unsupported_document_format" };
  }
  if (args.size <= 0) {
    return { ok: false, error: "document_empty" };
  }
  if (args.size > MAX_DOCUMENT_UPLOAD_BYTES) {
    return { ok: false, error: "document_too_large" };
  }
  return { ok: true };
}

export function normalizeDocumentText(input: string): string {
  return input
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/gu, " ").trim())
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

export function chunkDocumentText(
  input: string,
  maxCharacters = DOCUMENT_CHUNK_SIZE,
): string[] {
  if (!Number.isInteger(maxCharacters) || maxCharacters < 1) {
    throw new Error("document_chunk_size_invalid");
  }

  const text = normalizeDocumentText(input);
  if (!text) return [];

  const chunks: string[] = [];
  let current = "";
  const pushCurrent = () => {
    if (current) chunks.push(current);
    current = "";
  };

  for (const line of text.split("\n")) {
    if (line.length > maxCharacters) {
      pushCurrent();
      for (let index = 0; index < line.length; index += maxCharacters) {
        chunks.push(line.slice(index, index + maxCharacters));
      }
      continue;
    }

    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > maxCharacters) {
      pushCurrent();
      current = line;
    } else {
      current = candidate;
    }
  }
  pushCurrent();
  return chunks;
}

export async function extractDocumentText(
  filename: string,
  bytes: Uint8Array,
): Promise<string> {
  const extension = documentExtension(filename);
  if (extension === "pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: bytes });
    try {
      const result = await parser.getText();
      return normalizeDocumentText(result.text);
    } finally {
      await parser.destroy();
    }
  }

  if (extension === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return normalizeDocumentText(result.value);
  }

  return normalizeDocumentText(new TextDecoder().decode(bytes));
}
