"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { RecruitmentTrailer } from "@/components/recruitment-trailer";
import type { TrailerAttemptSubmission, TrailerInviteOpen } from "@/lib/contracts";
import { parseTrailerInviteOpen } from "@/lib/trailer-invite";

const UNAVAILABLE = "링크를 열 수 없습니다. 주소를 확인하거나 채용 담당자에게 문의하세요";
const SUBMISSION_NOTICE = "제출하면 채용 담당자에게 전달됩니다. 개인정보(이름·연락처)는 적지 마세요";

type FlowState = "email" | TrailerInviteOpen["state"];

async function post(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json().catch(() => null) as unknown;
  return { response, data };
}

export function TrailerInviteFlow({ token }: { token: string }) {
  const [state, setState] = useState<FlowState>("email");
  const [email, setEmail] = useState("");
  const [invite, setInvite] = useState<TrailerInviteOpen | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function verifyEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await post("/api/t/i/open", { token, email });
      const opened = result.response.ok ? parseTrailerInviteOpen(result.data) : null;
      if (!opened) {
        setMessage(UNAVAILABLE);
        return;
      }
      setEmail(email.trim().toLowerCase());
      setInvite(opened);
      setState(opened.state);
    } catch {
      setMessage(UNAVAILABLE);
    } finally {
      setBusy(false);
    }
  }

  async function consent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invite || !agreed || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await post("/api/t/i/consent", {
        token,
        email,
        consent_version: invite.consent_version,
      });
      if (!result.response.ok) {
        setMessage(UNAVAILABLE);
        return;
      }
      setInvite({ ...invite, state: "ready" });
      setState("ready");
    } catch {
      setMessage(UNAVAILABLE);
    } finally {
      setBusy(false);
    }
  }

  async function submit(submissions: TrailerAttemptSubmission[]): Promise<"ok" | "error"> {
    if (!invite) return "error";
    try {
      const result = await post("/api/t/i/submit", {
        token,
        email,
        consent_version: invite.consent_version,
        submissions,
      });
      if (!result.response.ok) return "error";
      setState("submitted");
      return "ok";
    } catch {
      return "error";
    }
  }

  async function withdraw() {
    if (!window.confirm("제출을 거두면 복구할 수 없습니다. 거둘까요?") || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await post("/api/t/i/withdraw", { token, email });
      if (!result.response.ok) {
        setMessage("거두지 못했습니다. 채용 담당자에게 문의하세요.");
        return;
      }
      setState("withdrawn");
    } catch {
      setMessage("거두지 못했습니다. 채용 담당자에게 문의하세요.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "ready" && invite) {
    return <RecruitmentTrailer
      scenarios={invite.scenarios}
      applyUrl={invite.apply_url}
      notice={`${invite.org_display_name} 채용 예고편`}
      submission={{ onSubmit: submit, notice: SUBMISSION_NOTICE }}
    />;
  }

  return <main className="mx-auto grid min-h-screen w-full max-w-xl content-center gap-6 px-5 py-12">
    <Link className="text-lg font-bold text-accent" href="/">사수</Link>
    {state === "email" ? <section className="grid gap-5 rounded-3xl border border-ink/10 bg-surface p-6 shadow-sm">
      <div className="grid gap-2"><p className="m-0 text-sm font-bold text-accent">채용 예고편</p><h1 className="m-0 text-3xl">초대 링크 확인</h1><p className="m-0 text-muted">이 링크를 받은 이메일 주소를 입력하세요</p></div>
      <form className="grid gap-4" onSubmit={verifyEmail}>
        <label className="grid gap-2 text-sm font-bold" htmlFor="candidate-email">이메일 주소</label>
        <input id="candidate-email" className="rounded-xl border border-ink/15 bg-white px-4 py-3" type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} required disabled={busy} />
        <button className="rounded-xl bg-accent px-5 py-3 font-bold text-white disabled:opacity-50" type="submit" disabled={busy}>{busy ? "확인 중…" : "확인"}</button>
      </form>
      <button type="button" className="text-sm text-urgent underline" disabled={busy || !email.includes("@")} onClick={withdraw}>기존 제출 취소</button>
      {message ? <p className="m-0 text-sm text-urgent" role="alert">{message}</p> : null}
      <p className="m-0 text-xs text-muted">작성 중인 내용은 브라우저에 저장되지 않으며, 새로고침하면 이메일 확인부터 다시 시작합니다.</p>
    </section> : null}

    {state === "consent_required" && invite ? <section className="grid gap-5 rounded-3xl border border-ink/10 bg-surface p-6 shadow-sm">
      <div className="grid gap-2"><p className="m-0 text-sm font-bold text-accent">{invite.org_display_name}</p><h1 className="m-0 text-3xl">개인정보 수집·이용 동의</h1></div>
      <dl className="grid gap-3 text-sm">
        <div><dt className="font-bold">수집 주체</dt><dd className="m-0 text-muted">{invite.org_display_name}</dd></div>
        <div><dt className="font-bold">수집 항목</dt><dd className="m-0 text-muted">이메일, 선택한 결정과 이유 서술, 단서 선택 기록</dd></div>
        <div><dt className="font-bold">이용 목적</dt><dd className="m-0 text-muted">채용 과제의 참고 자료와 면접 질문 준비</dd></div>
        <div><dt className="font-bold">보관 기간</dt><dd className="m-0 text-muted">제출 후 90일, 이후 자동 삭제 · 보관 중 이 링크에서 직접 거두기. 링크 이용이 중단되면 채용 담당자에게 삭제 요청</dd></div>
      </dl>
      <p className="m-0 rounded-2xl bg-bg p-4 text-sm">인공지능이 계산한 점수는 채용 담당자의 참고 자료이며, 합격 여부를 자동으로 결정하지 않습니다. 결과에 대한 설명이나 이의는 채용 담당자에게 요청할 수 있습니다.</p>
      <p className="m-0 text-sm text-muted">동의하지 않아도 불이익이 없습니다. 별도로 받은 공개 체험 링크가 있다면 동의 없이 이용할 수 있습니다.</p>
      <form className="grid gap-4" onSubmit={consent}>
        <label className="flex items-start gap-3 rounded-2xl border border-ink/10 p-4 text-sm"><input className="mt-1" type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} disabled={busy} /><span>위 내용을 확인했고 개인정보 수집·이용에 동의합니다.</span></label>
        <button className="rounded-xl bg-accent px-5 py-3 font-bold text-white disabled:opacity-50" type="submit" disabled={!agreed || busy}>{busy ? "처리 중…" : "동의하고 시작"}</button>
      </form>
      <Link className="text-sm text-accent underline" href="/privacy">개인정보처리방침</Link>
      {message ? <p className="m-0 text-sm text-urgent" role="alert">{message}</p> : null}
    </section> : null}

    {state === "submitted" && invite ? <section className="grid gap-5 rounded-3xl border border-ink/10 bg-surface p-6 shadow-sm">
      <h1 className="m-0 text-3xl">제출이 끝났습니다</h1><p className="m-0">제출이 끝났습니다. 결과는 채용 담당자가 확인합니다.</p>
      <button className="rounded-xl border border-urgent px-5 py-3 font-bold text-urgent disabled:opacity-50" type="button" onClick={withdraw} disabled={busy}>{busy ? "거두기 중…" : "내 제출 취소"}</button>
      {invite.apply_url?.startsWith("https://") ? <a className="text-accent underline" href={invite.apply_url} target="_blank" rel="noopener noreferrer">이 회사 공고 보기 →</a> : null}
      {message ? <p className="m-0 text-sm text-urgent" role="alert">{message}</p> : null}
    </section> : null}

    {state === "withdrawn" ? <section className="grid gap-4 rounded-3xl border border-ink/10 bg-surface p-6 shadow-sm"><h1 className="m-0 text-3xl">제출 취소</h1><p className="m-0">거두기 요청을 처리했습니다. 이메일이나 링크를 확인할 수 없는 경우 채용 담당자에게 삭제를 요청해 주세요.</p></section> : null}
  </main>;
}
