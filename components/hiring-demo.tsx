"use client";

import Link from "next/link";
import { useState } from "react";
import type { HiringMission, HiringSubmission } from "@/lib/contracts";
import { validateHiringFile, validateHiringSubmission } from "@/lib/hiring-demo";
import styles from "./hiring-demo.module.css";

type Progress = { started: boolean; draft: HiringSubmission; attachment: File | null; events: string[]; submitted: HiringSubmission | null; sample: boolean; notes: Record<string, string> };
const empty = (): Progress => ({ started: false, draft: { approach: "", artifact: "", factIds: [], checkpoints: [], file: null }, attachment: null, events: [], submitted: null, sample: false, notes: {} });

export function HiringDemo({ missions }: { missions: HiringMission[] }) {
  const [selected, setSelected] = useState(missions[0].id);
  const [states, setStates] = useState<Record<string, Progress>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [fileKey, setFileKey] = useState(0);
  const mission = missions.find(entry => entry.id === selected)!;
  const state = states[selected] ?? empty();
  const update = (change: (current: Progress) => Progress) => setStates(current => ({ ...current, [selected]: change(current[selected] ?? empty()) }));
  const edit = (value: Partial<HiringSubmission>) => update(current => ({ ...current, draft: { ...current.draft, ...value } }));
  function start() { setErrors([]); update(current => ({ ...current, started: true, events: [...current.events, "합성 미션 시작 · 직접 남긴 작업 기록만 표시합니다"] })); }
  function submit() {
    const problems = validateHiringSubmission(mission, state.draft);
    setErrors(problems);
    if (problems.length || !state.started || state.submitted) return;
    update(current => ({ ...current, submitted: structuredClone(current.draft), events: [...current.events, "결과 제출 미리보기 완료 · 서버에는 접수되지 않음"] }));
  }
  function reset() {
    if (!window.confirm("이 부서의 작성 내용과 제출 미리보기를 지울까요?")) return;
    setErrors([]); setFileKey(key => key + 1); setStates(current => ({ ...current, [selected]: empty() }));
  }
  return <main className={styles.shell}>
    <header className={styles.header}>
      <Link href="/demo">← 사수 데모</Link><span className={styles.badge}>가상 지원자 전용 · 서버 저장 없음</span>
      <h1>다섯 팀, 다섯 가지 첫 업무</h1>
      <p>신입 채용 미션을 직접 수행하고, 작업 과정과 결과를 같은 화면에서 확인하세요.</p>
      <p className={styles.notice}>실제 지원자·회사 자료를 넣지 마세요. 입력과 첨부는 이 탭의 메모리에서만 다루며 새로고침하면 사라집니다. 채용팀 접수·공개 게시·자동 채점·합불 판단은 하지 않습니다.</p>
    </header>
    <nav className={styles.teams} aria-label="채용 미션 부서">
      {missions.map(entry => <button key={entry.id} type="button" aria-pressed={selected === entry.id} onClick={() => { setSelected(entry.id); setErrors([]); setFileKey(key => key + 1); }}><strong>{entry.team}</strong><span>{states[entry.id]?.submitted ? "제출 미리보기 완료" : states[entry.id]?.started ? "진행 중" : "시작 전"}</span></button>)}
    </nav>
    <div className={styles.layout}>
      <section className={styles.main} aria-label={`${mission.team} 미션`}>
        <article className={styles.panel}><p className={styles.eyebrow}>{mission.role} · {mission.timebox}</p><h2>{mission.title}</h2><p>{mission.brief}</p><h3>제출할 산출물</h3><ul>{mission.deliverables.map(item => <li key={item}>{item}</li>)}</ul><h3>사람이 확인할 기준 · 점수/순위 없음</h3><ul>{mission.criteria.map(item => <li key={item}>{item}</li>)}</ul></article>
        <article className={styles.panel}><h3>미션 참고자료</h3><p>아래는 과제용으로 작성한 가상 회사 자료입니다. 판단에 사용한 자료를 선택해 주세요.</p>
          {mission.facts.map(fact => <blockquote className={styles.fact} key={fact.id}><p>{fact.text}</p><cite>{fact.label} · 가상 회사 자료</cite><label><input type="checkbox" disabled={!state.started || !!state.submitted} checked={state.draft.factIds.includes(fact.id)} onChange={event => edit({ factIds: event.target.checked ? [...state.draft.factIds, fact.id] : state.draft.factIds.filter(id => id !== fact.id) })} />{fact.label}를 판단 근거로 선택</label></blockquote>)}
        </article>
        {!state.started ? <section className={styles.panel}><h3>가상 지원자로 시작하기</h3><p>과정 패널은 아래 버튼으로 직접 남긴 단계 기록만 보여줍니다. 화면·키 입력·웹캠을 수집하지 않으며, 소요 시간으로 평가하지 않습니다.</p><button className={styles.primary} onClick={start}>합성 미션 시작</button></section> : <>
          <section className={styles.panel}><h3>작업 과정 남기기</h3><p>참고자료를 읽고 가설·구현 선택·검증 결과를 직접 남겨 주세요. 단계마다 10~2,000자입니다.</p>
            <fieldset disabled={!!state.submitted}>{mission.stages.map(stage => <div className={styles.stage} key={stage.id}><label htmlFor={stage.id}>{stage.label}</label><p>{stage.prompt}</p><textarea id={stage.id} rows={3} maxLength={2000} value={state.notes[stage.id] ?? ""} onChange={event => update(current => ({ ...current, notes: { ...current.notes, [stage.id]: event.target.value } }))} /><button onClick={() => {
              const note = state.notes[stage.id]?.trim() ?? "";
              if (note.length < 10) { setErrors(["작업 단계 기록은 10자 이상 작성해 주세요."]); return; }
              setErrors([]); update(current => ({ ...current, draft: { ...current.draft, checkpoints: [...current.draft.checkpoints.filter(item => item.stageId !== stage.id), { stageId: stage.id, note }] }, events: [...current.events, `${stage.label} 기록${current.draft.checkpoints.some(item => item.stageId === stage.id) ? " 수정" : " 완료"}`] }));
            }}>{stage.label} 기록하기</button>{state.draft.checkpoints.some(item => item.stageId === stage.id) ? <span className={styles.saved}>기록됨</span> : null}</div>)}</fieldset>
          </section>
          <section className={styles.panel}><h3>결과 제출 미리보기</h3><fieldset disabled={!!state.submitted}>
            <label htmlFor="hiring-approach">판단 근거와 남은 한계</label><textarea id="hiring-approach" rows={4} maxLength={6000} value={state.draft.approach} onChange={event => edit({ approach: event.target.value })} />
            <label htmlFor="hiring-artifact">산출물 · 문서/코드/화면 설계 설명</label><textarea id="hiring-artifact" rows={10} maxLength={40000} spellCheck={false} value={state.draft.artifact} onChange={event => edit({ artifact: event.target.value })} />
            <label htmlFor="hiring-file">합성 산출물 파일 선택 · 선택 사항, 2메가바이트 이하</label><input key={fileKey} id="hiring-file" type="file" accept=".txt,.md,.json,.js,.ts,.tsx,.css,.html,.svg,.pdf,.png,.jpg,.jpeg,.webp,.zip" onChange={event => {
              const file = event.target.files?.[0];
              if (!file) return;
              const problem = validateHiringFile(file);
              if (problem) { setErrors([problem]); event.target.value = ""; return; }
              setErrors([]); update(current => ({ ...current, attachment: file, draft: { ...current.draft, file: { name: file.name, size: file.size } }, events: [...current.events, "합성 첨부 선택 · 서버 전송·내용 실행 없음"] }));
            }} />
            <p className={styles.notice}>파일 내용은 이 탭의 파일 객체로만 보관합니다. .pdf 파일·이미지·.zip 파일·코드를 분석하거나 실행하지 않으며 결과 화면에는 이름과 크기만 표시합니다.</p>
            {state.draft.file ? <p>{state.draft.file.name} · {state.draft.file.size.toLocaleString()}바이트 <button onClick={() => { update(current => ({ ...current, attachment: null, draft: { ...current.draft, file: null } })); setFileKey(key => key + 1); }}>첨부 제거</button></p> : null}
            <button className={styles.primary} onClick={submit}>결과 제출 (데모)</button>
          </fieldset></section>
        </>}
        {errors.length ? <div className={styles.error} role="alert"><strong>제출 전 확인해 주세요</strong><ul>{errors.map(error => <li key={error}>{error}</li>)}</ul></div> : null}
        {state.submitted ? <section className={styles.panel} aria-label="제출 결과"><h3>제출 미리보기 완료</h3><p role="status">이 브라우저에서만 제출 결과를 확인할 수 있습니다. 채용팀에는 전송되지 않았습니다.</p>{state.sample ? <p className={styles.badge}>합성 샘플을 바탕으로 작성한 제출</p> : null}<h4>판단 근거</h4><p className={styles.pre}>{state.submitted.approach}</p><h4>산출물</h4><pre className={styles.artifact}>{state.submitted.artifact || "첨부 파일 미리보기"}</pre>{state.submitted.file ? <p>선택한 파일: {state.submitted.file.name} · {state.submitted.file.size.toLocaleString()}바이트 · 내용 분석/서버 업로드 없음</p> : null}<h4>선택한 근거</h4>{mission.facts.filter(fact => state.submitted!.factIds.includes(fact.id)).map(fact => <blockquote className={styles.fact} key={fact.id}>{fact.text}<cite>{fact.label} · 가상 회사 자료</cite></blockquote>)}</section> : null}
      </section>
      <aside className={styles.side}>
        <section className={styles.panel} aria-label="진행 모니터"><h2>진행 기록</h2><p>{mission.team} · 가상 지원자</p><p>{state.submitted ? "제출 미리보기 완료" : state.started ? "진행 중" : "시작 전"}</p><progress max={3} value={state.draft.checkpoints.length} aria-label="기록한 작업 단계" /><p>3단계 중 {state.draft.checkpoints.length}단계 기록{state.sample ? " · 샘플 포함" : ""}</p><p className={styles.notice}>직접 남긴 기록만 표시합니다. 실제 작업을 관찰하거나 품질을 자동 검증한 결과가 아닙니다.</p><ol>{state.events.map((entry, index) => <li key={index}>{entry}</li>)}</ol><button onClick={reset}>이 부서 체험 초기화</button></section>
        <section className={styles.panel}><h3>가상 지원자 샘플</h3><p>정답이나 실제 지원자 결과가 아닌, 과제 형식을 이해하기 위한 예시입니다.</p><details><summary>샘플 판단·산출물 보기</summary><p>{mission.sample.approach}</p><pre className={styles.artifact}>{mission.sample.artifact}</pre></details><button disabled={!state.started || !!state.submitted} onClick={() => {
          setErrors([]); update(current => ({ ...current, sample: true, draft: { ...current.draft, approach: mission.sample.approach, artifact: mission.sample.artifact, factIds: mission.facts.map(fact => fact.id), checkpoints: mission.stages.map(stage => ({ stageId: stage.id, note: `합성 샘플: ${stage.label}에서 참고자료와 대안을 비교했습니다. 실제 작업 기록이 아닙니다.` })) }, notes: Object.fromEntries(mission.stages.map(stage => [stage.id, `합성 샘플: ${stage.label}에서 참고자료와 대안을 비교했습니다. 실제 작업 기록이 아닙니다.`])), events: [...current.events, "합성 샘플 불러오기 · 작업 수행을 관측한 기록이 아님"] }));
        }}>합성 샘플로 채우기</button></section>
        <Link href={`/demo/d/${mission.deptId}`}>이 부서의 결정·근거 데모 →</Link>
      </aside>
    </div>
  </main>;
}
