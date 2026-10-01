// Design Ref: desktop-companion §7 S7 — notifications expose status and counts only.
import { Notification } from "electron";

export function notify(kind: "answer" | "cards" | "failed", count = 0, onClick?: () => void): void {
  const body = kind === "answer" ? "답이 도착했어요" : kind === "cards" ? `결정할 카드가 ${count}건 있어요` : "작업이 실패했어요";
  const notification = new Notification({ title: "사수", body });
  if (onClick) notification.on("click", onClick);
  notification.show();
}
