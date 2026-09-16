"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";

export function DemoReadOnlyFrame({ children }: { children: React.ReactNode }) {
  return (
    <>
      <section className="demo-safe-banner" role="status">
        <Icon name="lock" size={17} />
        <div>
          <strong>심사위원 안전 체험</strong>
          <p>실제 저장·업로드·외부 연결은 실행하지 않습니다. 합성 시드의 화면과 완료 조건을 그대로 확인할 수 있습니다.</p>
        </div>
      </section>
      <div inert className="demo-inert-surface" aria-label="읽기 전용 기능 미리보기">
        {children}
      </div>
    </>
  );
}

export function DemoDecisionSimulator() {
  const [rationale, setRationale] = useState("");
  const [status, setStatus] = useState<"open" | "decided" | "deferred" | "rejected">("open");
  const [error, setError] = useState("");

  const choose = (next: typeof status) => {
    if (next === "decided" && !rationale.trim()) {
      setError("결정 사유를 입력하면 브라우저 안에서 결과를 미리 볼 수 있습니다.");
      return;
    }
    setError("");
    setStatus(next);
  };

  return (
    <section className="demo-action-simulator" aria-labelledby="demo-decision-action-heading">
      <header>
        <div>
          <p className="eyebrow">안전 체험</p>
          <h2 id="demo-decision-action-heading">카드에서 결정하기</h2>
        </div>
        <span className="badge badge-neutral"><Icon name="lock" size={12} /> 브라우저에서만 반영</span>
      </header>
      {status === "open" ? (
        <>
          <label>
            결정 사유
            <textarea value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="예: 10% 이상 인상 원칙에 따라 재입찰을 먼저 검토합니다." />
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="button button-primary button-small" type="button" onClick={() => choose("decided")}>재입찰로 결정</button>
            <button className="button button-secondary button-small" type="button" onClick={() => choose("deferred")}>보류</button>
            <button className="button button-secondary button-small" type="button" onClick={() => choose("rejected")}>반려</button>
          </div>
        </>
      ) : (
        <div className="demo-action-result" role="status">
          <Icon name={status === "decided" ? "check" : "book"} size={18} />
          <div>
            <strong>{status === "decided" ? "결정 완료 미리보기" : status === "deferred" ? "보류 상태 미리보기" : "반려 상태 미리보기"}</strong>
            <p>{status === "decided" ? rationale : "실제 카드나 원장은 변경되지 않았습니다."}</p>
          </div>
          <button type="button" onClick={() => setStatus("open")}>다시 체험</button>
        </div>
      )}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </section>
  );
}

export function DemoLedgerSimulator() {
  const [outcome, setOutcome] = useState("");
  const [rationale, setRationale] = useState("");
  const [preview, setPreview] = useState<{ outcome: string; rationale: string } | null>(null);

  return (
    <section className="demo-action-simulator" aria-labelledby="demo-ledger-action-heading">
      <header>
        <div><p className="eyebrow">안전 체험</p><h2 id="demo-ledger-action-heading">결정 직접 기록</h2></div>
        <span className="badge badge-neutral"><Icon name="lock" size={12} /> 새로고침하면 초기화</span>
      </header>
      {preview ? (
        <article className="demo-ledger-preview" role="status">
          <span className="badge badge-green">결정 미리보기</span>
          <h3>{preview.outcome}</h3>
          <p>{preview.rationale}</p>
          <button type="button" onClick={() => setPreview(null)}>다시 작성</button>
        </article>
      ) : (
        <div className="demo-simulator-form">
          <label>결정 내용<input value={outcome} onChange={(event) => setOutcome(event.target.value)} placeholder="예: 외주사 B는 재입찰을 진행합니다." /></label>
          <label>결정 이유<textarea value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="근거와 감수한 조건을 적어보세요." /></label>
          <button className="button button-primary button-small" disabled={!outcome.trim() || !rationale.trim()} type="button" onClick={() => setPreview({ outcome: outcome.trim(), rationale: rationale.trim() })}>원장 반영 미리보기</button>
        </div>
      )}
    </section>
  );
}

export function DemoReviewSimulator() {
  const [fileName, setFileName] = useState("");
  const [consented, setConsented] = useState(false);
  const [stage, setStage] = useState<"ready" | "review" | "confirmed">("ready");
  const [draft, setDraft] = useState("회의 참석자는 외주사 B의 12% 인상안보다 재입찰 검토가 우선이라고 정리했습니다.");

  return (
    <main className="workspace-page review-workspace">
      <header className="page-heading">
        <div>
          <p className="eyebrow">음성·자료 검토</p>
          <h1>파일에서 근거가 되기까지</h1>
          <p>파일 선택부터 사용자 확인과 근거 확정까지, 서버 전송 없이 체험합니다.</p>
        </div>
      </header>
      <section className="demo-review-steps" aria-label="자료 검토 단계">
        {["파일 선택", "전사·추출", "사용자 검토", "근거 확정"].map((label, index) => (
          <span key={label} data-active={stage === "confirmed" || (stage === "review" && index <= 2) || (stage === "ready" && index === 0)}><b>{index + 1}</b>{label}</span>
        ))}
      </section>
      {stage === "ready" ? (
        <section className="panel demo-review-form">
          <h2>합성 파일로 업로드 흐름 확인</h2>
          <label>검토할 파일<input type="file" accept=".txt,.md,.csv,.json,.pdf,.docx,audio/*" onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")} /></label>
          <label className="demo-check-row"><input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} /> 참여자 전원의 수집·보관 동의를 확인했습니다.</label>
          <div className="upload-readiness" aria-label="업로드 준비 상태">
            <span data-ready={Boolean(fileName)}>{fileName ? `파일 · ${fileName}` : "파일 선택 필요"}</span>
            <span data-ready>자료 유형 · 자동 판별</span>
            <span data-ready={consented}>{consented ? "동의 확인" : "동의 확인 필요"}</span>
          </div>
          <button className="button button-primary" disabled={!fileName || !consented} type="button" onClick={() => setStage("review")}>전사·추출 결과 보기</button>
          <p className="field-help"><Icon name="lock" size={13} /> 선택한 파일은 브라우저 밖으로 전송되지 않습니다.</p>
        </section>
      ) : (
        <section className="panel demo-review-editor">
          <header><div><p className="eyebrow">추출 완료 · 합성 결과</p><h2>원문을 확인하고 고쳐주세요</h2></div><span className="badge badge-green">마스킹 확인</span></header>
          <textarea aria-label="합성 전사 검토" value={draft} onChange={(event) => setDraft(event.target.value)} />
          {stage === "review" ? <button className="button button-primary" disabled={!draft.trim()} type="button" onClick={() => setStage("confirmed")}>이 내용으로 근거 확정 체험</button> : <div className="demo-action-result" role="status"><Icon name="check" size={18} /><div><strong>근거 확정 미리보기 완료</strong><p>실제 source·items·jobs 행은 생성되지 않았습니다.</p></div><button type="button" onClick={() => setStage("ready")}>처음부터</button></div>}
        </section>
      )}
    </main>
  );
}
