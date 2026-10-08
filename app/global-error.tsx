"use client";

import { useEffect } from "react";
import { reportClientError } from "@/components/sentry-client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => { void reportClientError(error); }, [error]);
  return (
    <html lang="ko">
      <body style={{ margin: 0, background: "#f6f7f5", color: "#1f2823", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ display: "grid", minHeight: "100vh", placeContent: "center", padding: "2rem" }}>
          <section style={{ display: "grid", maxWidth: "32rem", gap: "1rem", borderRadius: "1.5rem", background: "white", padding: "2rem" }}>
            <strong style={{ color: "#b0611b" }}>사수를 불러오지 못했습니다</strong>
            <h1 style={{ margin: 0, color: "#17614a", fontSize: "2rem" }}>잠시 후 다시 시도해주세요</h1>
            <p style={{ margin: 0, lineHeight: 1.7, color: "#66716a" }}>내부 오류 내용은 화면에 표시하지 않습니다.</p>
            <button onClick={reset} style={{ width: "fit-content", border: 0, borderRadius: "0.75rem", background: "#17614a", color: "white", cursor: "pointer", fontWeight: 700, padding: "0.75rem 1.25rem" }} type="button">
              다시 시도
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
