// Design Ref: desktop-companion §6·§11.4 G3 — IPC channel names and error codes stay out of user notices.
export function message(cause: unknown): string {
  if (!(cause instanceof Error)) return "요청을 처리하지 못했습니다. 잠시 뒤 다시 해 주세요.";
  const detail = cause.message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/u, "");
  return /^[a-z][a-z0-9_]*:\s*(.+)$/su.exec(detail)?.[1] ?? detail;
}
