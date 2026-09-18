import { extractNotionText, type NotionBlock } from "@/lib/notion";
import { mask } from "@/lib/mask";

export const NOTION_CHUNK_LIMIT = 2_400;

export type NotionChunk = { externalRef: string; content: string };

type PropertyValue = Record<string, unknown>;

function richTextValue(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((part) => {
      if (typeof part !== "object" || part === null) return "";
      const plainText = Reflect.get(part, "plain_text");
      if (typeof plainText === "string") return plainText;
      const text = Reflect.get(part, "text");
      return typeof text === "object" && text !== null && typeof Reflect.get(text, "content") === "string"
        ? (Reflect.get(text, "content") as string)
        : "";
    })
    .join("")
    .trim();
}

function namedValue(value: unknown): string {
  return typeof value === "object" && value !== null && typeof Reflect.get(value, "name") === "string"
    ? (Reflect.get(value, "name") as string)
    : "";
}

function propertyText(property: PropertyValue): string {
  const type = property.type;
  switch (type) {
    case "title":
    case "rich_text":
      return richTextValue(property[type]);
    case "select":
    case "status":
      return namedValue(property[type]);
    case "multi_select": {
      const values = property.multi_select;
      return Array.isArray(values)
        ? values.map(namedValue).filter(Boolean).join(", ")
        : "";
    }
    case "date": {
      const date = property.date;
      if (typeof date !== "object" || date === null) return "";
      const start = Reflect.get(date, "start");
      const end = Reflect.get(date, "end");
      if (typeof start !== "string") return "";
      return typeof end === "string" && end ? `${start} ~ ${end}` : start;
    }
    case "number":
      return typeof property.number === "number" ? String(property.number) : "";
    case "checkbox":
      return typeof property.checkbox === "boolean" ? String(property.checkbox) : "";
    case "url":
      return typeof property.url === "string" ? property.url : "";
    default:
      return "";
  }
}

export function notionPropertyLines(properties: Record<string, unknown>): string[] {
  return Object.entries(properties).flatMap(([name, value]) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
    const text = propertyText(value as PropertyValue);
    return text ? [`${name}: ${text}`] : [];
  });
}

function splitLongText(text: string): string[] {
  const pieces: string[] = [];
  let remaining = text;
  while (remaining.length > NOTION_CHUNK_LIMIT) {
    const limit = NOTION_CHUNK_LIMIT;
    let splitAt = 0;
    for (let index = limit; index > 0; index -= 1) {
      const before = remaining[index - 1];
      if (before === "\n" || before === "。") {
        splitAt = index;
        break;
      }
      if (before === " " && remaining[index - 2] === ".") {
        splitAt = index;
        break;
      }
    }
    if (!splitAt) splitAt = limit;
    pieces.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  if (remaining) pieces.push(remaining);
  return pieces;
}

function blockRef(block: NotionBlock, index: number): string {
  return typeof block.id === "string" && block.id ? block.id : `block-${index + 1}`;
}

function uniqueRef(preferred: string, used: Set<string>): string {
  let candidate = preferred;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${preferred}#${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

export function chunkNotionBlocks(args: {
  blocks: NotionBlock[];
  properties?: Record<string, unknown>;
}): NotionChunk[] {
  const textBlocks = args.blocks.flatMap((block, index) => {
    // 자르기 전에 블록 단위로 마스킹한다. 자른 뒤에 하면 청크 경계에 걸친 이메일·전화번호가 패턴에 안 잡힌다.
    const raw = extractNotionText(block);
    const text = mask(raw);
    return text ? [{ block, index, text, rawLength: raw.length }] : [];
  });
  // 분량 판정은 마스킹 전 길이로 한다(치환 토큰이 원문보다 짧아 경계가 흔들리지 않게). 원문 자체는 남기지 않는다.
  const bodyLength = textBlocks.reduce(
    (length, entry, index) => length + entry.rawLength + (index ? 1 : 0),
    0,
  );
  if (bodyLength < 40) return [];

  const rawChunks: Array<{ externalRef: string; content: string }> = [];
  const usedRefs = new Set<string>();
  let current: { externalRef: string; content: string } | null = null;

  const flush = () => {
    if (current) rawChunks.push(current);
    return null;
  };

  const startLongText = (ref: string, text: string) => {
    const pieces = splitLongText(text);
    let last: { externalRef: string; content: string } | null = null;
    pieces.forEach((piece, pieceIndex) => {
      const chunk = {
        externalRef: uniqueRef(pieceIndex ? `${ref}#${pieceIndex + 1}` : ref, usedRefs),
        content: piece,
      };
      if (pieceIndex === pieces.length - 1) last = chunk;
      else rawChunks.push(chunk);
    });
    return last;
  };
  let hasPreviousBlock = false;
  for (const { block, index, text } of textBlocks) {
    const ref = blockRef(block, index);
    const isHeading = block.type === "heading_1" || block.type === "heading_2" || block.type === "heading_3";
    let separatorStored = false;
    if (isHeading) {
      if (current && current.content.length < NOTION_CHUNK_LIMIT) {
        current.content += "\n";
        separatorStored = true;
      }
      current = flush();
    }
    let incoming = `${hasPreviousBlock && !separatorStored ? "\n" : ""}${text}`;
    hasPreviousBlock = true;

    if (!current) {
      if (incoming.length <= NOTION_CHUNK_LIMIT) {
        current = { externalRef: uniqueRef(ref, usedRefs), content: incoming };
        continue;
      }
      current = startLongText(ref, incoming);
      continue;
    }

    const joined = `${current.content}${incoming}`;
    if (joined.length <= NOTION_CHUNK_LIMIT) {
      current.content = joined;
      continue;
    }
    if (incoming.startsWith("\n") && current.content.length < NOTION_CHUNK_LIMIT) {
      current.content += "\n";
      incoming = incoming.slice(1);
    }
    current = flush();
    if (incoming.length <= NOTION_CHUNK_LIMIT) {
      current = { externalRef: uniqueRef(ref, usedRefs), content: incoming };
      continue;
    }
    current = startLongText(ref, incoming);
  }
  current = flush();

  const propertyLines = args.properties ? notionPropertyLines(args.properties) : [];
  if (rawChunks.length && propertyLines.length) {
    rawChunks[0].content = `${mask(propertyLines.join("\n"))}\n${rawChunks[0].content}`;
  }
  return rawChunks;
}
