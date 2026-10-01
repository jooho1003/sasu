// Design Ref: desktop-companion §7 S4·S6 — logs carry identifiers, lengths, and codes only.
type LogMeta = {
  id?: string;
  length?: number;
  code?: string;
  status?: number;
};

function sanitized(meta: LogMeta): LogMeta {
  return {
    ...(meta.id ? { id: meta.id } : {}),
    ...(typeof meta.length === "number" ? { length: meta.length } : {}),
    ...(meta.code ? { code: meta.code } : {}),
    ...(typeof meta.status === "number" ? { status: meta.status } : {}),
  };
}

export function logInfo(event: string, meta: LogMeta = {}): void {
  console.info(`[sasu-desktop] ${JSON.stringify({ event, ...sanitized(meta) })}`);
}

export function logError(event: string, meta: LogMeta = {}): void {
  console.error(`[sasu-desktop] ${JSON.stringify({ event, ...sanitized(meta) })}`);
}
