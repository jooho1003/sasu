import React from "react";
import { createRoot } from "react-dom/client";
import CardActions from "@/components/card-actions";
import AskS4 from "@/components/ask-s4";
import "./style.css";
const scenario = new URLSearchParams(location.search).get("scenario") || "card";
createRoot(document.getElementById("root")).render(<>
  <header><small>검토용 격리 실행 · 합성 사례 · 원래 컴포넌트 / 단순 검토용 스타일</small><h1>페르소나 사용 흐름 재현</h1></header>
  {scenario === "ask" ? <AskS4 deptId="11111111-1111-4111-8111-111111111111"/> : <section><h2>영업팀 · 가격 예외 승인</h2><p>AI 추천: 고객 A의 12% 할인 요청을 승인한다.</p><p>사용자의 의도: 5% 할인만 승인한다.</p><CardActions cardId="22222222-2222-4222-8222-222222222222" deptId="11111111-1111-4111-8111-111111111111" status={scenario === "deferred" ? "deferred" : "open"} outcome="고객 A의 12% 할인 요청을 승인한다." canAct={scenario !== "readonly"} isLead={scenario !== "deferred"}/></section>}
</>);
