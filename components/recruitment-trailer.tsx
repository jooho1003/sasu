"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { TrailerScenario, TrailerSubmission } from "@/lib/contracts";
import { validateSubmission } from "@/lib/trailer";
import { INTERACTIONS, type PlaceId } from "@/lib/trailer-world";
import { TrailerOffice, type OfficeHandle } from "./trailer-office";
import styles from "./recruitment-trailer.module.css";

type Overlay = "place" | "notebook" | "destinations" | null;
const characters = [{ name: "초록 재킷", color: "#6da183" }, { name: "노란 니트", color: "#d8af65" }, { name: "파란 셔츠", color: "#7b9dc3" }];

export function RecruitmentTrailer({ scenarios }: { scenarios: TrailerScenario[] }) {
  const [screen, setScreen] = useState<"intro" | "play" | "finished">("intro");
  const [mode, setMode] = useState<"map" | "list">("map");
  const [quest, setQuest] = useState(0);
  const [character, setCharacter] = useState(0);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [place, setPlace] = useState<PlaceId>("lobby");
  const [discovered, setDiscovered] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [dialogueId, setDialogueId] = useState<string | null>(null);
  const [choice, setChoice] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState<TrailerSubmission[]>([]);
  const [travel, setTravel] = useState<{ id: PlaceId; serial: number } | null>(null);
  const office = useRef<OfficeHandle>(null);
  const modal = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const scenario = scenarios[quest];
  const currentPlace = INTERACTIONS.find((entry) => entry.id === place)!;
  const submitted = results[quest];
  const dialogue = scenario.dialogues.find((entry) => entry.id === dialogueId && entry.place === place);

  useEffect(() => {
    if (overlay) { if (!modal.current?.open) modal.current?.showModal(); heading.current?.focus(); }
    else { modal.current?.close(); if (screen === "play" && mode === "map") office.current?.focus(); }
  }, [overlay, place, screen, mode]);
  useEffect(() => { if (travel) office.current?.walkTo(travel.id); }, [travel]);

  function discover(ids: string[]) { setDiscovered((current) => [...new Set([...current, ...ids])]); }
  function visit(id: PlaceId) {
    setPlace(id); setDialogueId(null); setOverlay("place");
    if (["library", "meeting", "messenger"].includes(id)) discover(scenario.facts.filter((fact) => fact.place === id).map((fact) => fact.id));
  }
  function walkTo(id: PlaceId) { setOverlay(null); setTravel((current) => ({ id, serial: (current?.serial ?? 0) + 1 })); }
  function clearQuest() { setDiscovered([]); setSelected([]); setDialogueId(null); setChoice(""); setReason(""); setError(""); setPlace("lobby"); setOverlay(null); setTravel(null); }
  function restart() { clearQuest(); setQuest(0); setResults([]); setScreen("intro"); }
  function submit() {
    const result = validateSubmission(scenario, discovered, { choice_id: choice, reason, fact_ids: selected });
    if (!result) { setError("선택지와 결정 이유를 작성하고, 단서 수첩에서 근거를 하나 이상 골라주세요."); return; }
    setError(""); setResults((current) => current[quest] ? current : [...current, result]); visit("archive");
  }
  function notebook() {
    return <section className={styles.notebook} aria-label="단서 수첩">
      <div className={styles.sectionHeading}><h3>단서 수첩</h3><span>{discovered.length} / {scenario.facts.length}</span></div><p className={styles.muted}>내 결정에 참고할 근거를 골라주세요.</p>
      {discovered.length === 0 ? <p className={styles.empty}>아직 수첩이 비어 있어요. 서고를 살펴보거나 동료에게 말을 걸어보세요.</p> : scenario.facts.filter((fact) => discovered.includes(fact.id)).map((fact) => <label className={styles.note} key={fact.id}><input type="checkbox" disabled={Boolean(submitted)} checked={selected.includes(fact.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, fact.id] : current.filter((id) => id !== fact.id))} /><span><b>{fact.label}</b><small>{fact.text}</small></span></label>)}
    </section>;
  }
  function comparison(index: number) {
    const entry = scenarios[index], result = results[index];
    const evidence = entry.facts.find((fact) => fact.id === entry.ending.fact_id)!;
    return <div className={styles.comparison}>
      <section><span className={styles.eyebrow}>내가 내린 결정</span><h3>{entry.choices.find((item) => item.id === result.choice_id)?.label}</h3><p className={styles.reason}>{result.reason}</p><p className={styles.muted}>참고한 단서: {result.fact_ids.map((id) => entry.facts.find((fact) => fact.id === id)?.label).join(" · ")}</p></section>
      <section><span className={styles.eyebrow}>가상 팀이 내린 결정</span><h3>{entry.choices.find((item) => item.id === entry.ending.choice_id)?.label}</h3><blockquote>{entry.ending.quote}<cite>근거 · {evidence.label}</cite></blockquote></section>
    </div>;
  }
  function placeContent() {
    if (place === "lobby" || place === "help") return <>
      <p className={styles.dialogueText}>{place === "lobby" ? "반가워요! 오늘은 이 오피스에서 함께 일해볼 거예요. 원칙을 살펴보고, 동료에게 물어본 뒤 당신의 결정을 남겨주세요." : "안녕하세요, 오늘의 사수 민서예요. 서고의 원칙과 동료의 이야기를 함께 살펴보세요. 중요한 단서는 수첩에 체크하고, 팀장실에서 결정과 이유를 남기면 돼요."}</p>
      <div className={styles.dialogueActions}><span>무엇부터 해볼까요?</span><button onClick={() => mode === "map" ? walkTo("library") : visit("library")}>서고부터 둘러보기 →</button><button onClick={() => setOverlay(null)}>직접 둘러볼게요</button></div>
    </>;
    if (place === "inbox") return submitted ? <><p>이 퀘스트의 결정을 작성했어요.</p><button className={styles.primary} onClick={() => visit("archive")}>기록실에서 비교하기</button></> : <form onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <fieldset className={styles.choices}><legend>어떤 결정을 내릴까요?</legend>{scenario.choices.map((entry) => <label key={entry.id}><input type="radio" name="trailer-choice" checked={choice === entry.id} onChange={() => setChoice(entry.id)} />{entry.label}</label>)}</fieldset>
      <label className={styles.reasonLabel} htmlFor="trailer-reason">결정 이유<textarea id="trailer-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={3} placeholder="중요하게 본 기준과 감수할 점을 적어주세요." /></label><p className={styles.muted}>{reason.length}/1000자 · 개인정보는 적지 마세요.</p>
      {notebook()}{error ? <p className={styles.error} role="alert">{error}</p> : null}<button className={styles.primary} type="submit">결정하고 기록실 열기 →</button><p className={styles.notice}>작성 내용은 이 브라우저에서만 사용하고 서버로 전송하지 않아요.</p>
    </form>;
    if (place === "archive") return submitted ? <><p>선택이 달라도 틀린 것이 아니에요. 어떤 기준을 중요하게 봤는지 비교해보세요.</p>{comparison(quest)}<button className={styles.primary} onClick={() => {
      if (quest + 1 === scenarios.length) { setOverlay(null); setScreen("finished"); } else { clearQuest(); setQuest((current) => current + 1); }
    }}>{quest + 1 === scenarios.length ? "전체 체험 돌아보기 →" : "다음 퀘스트 →"}</button></> : <><p>내 결정을 작성하면 가상 팀의 선택과 이유가 열립니다.</p><button className={styles.primary} onClick={() => mode === "map" ? walkTo("inbox") : visit("inbox")}>결정 작성하러 가기</button></>;
    if (place === "finance" || place === "partner") return <>
      <p className={styles.dialogueText}>{dialogue ? dialogue.quote : `반가워요! ${place === "finance" ? "예산과 일정을 함께 살펴볼까요?" : "고객과 협력사 이야기가 궁금한가요?"}`}</p>
      {dialogue ? <p className={styles.citation}>사실집 근거 · {scenario.facts.find((fact) => fact.id === dialogue.fact_id)?.label}<span>수첩에 담았어요 ✓</span></p> : null}
      <div className={styles.dialogueActions}><span>물어보기</span>{scenario.dialogues.filter((entry) => entry.place === place).map((entry) => <button key={entry.id} onClick={() => { setDialogueId(entry.id); discover([entry.fact_id]); }}>{entry.question} <span>↗</span></button>)}<button onClick={() => setOverlay(null)}>고마워요, 또 올게요</button></div><p className={styles.notice}>가상 동료는 준비된 사실집 안에서만 대답해요.</p>
    </>;
    return <>{scenario.facts.filter((fact) => fact.place === place).map((fact) => <blockquote key={fact.id}>{fact.text}<cite>사실집 · {fact.label}</cite></blockquote>)}<p className={styles.collected}>단서 수첩에 담았어요 ✓</p><button className={styles.primary} onClick={() => setOverlay(null)}>계속 둘러보기 →</button></>;
  }
  return <main className={styles.shell}>
    <header className={styles.header}><div className={styles.brand}><span className={styles.brandIcon}>ㅅ</span><strong>사수</strong><span className={styles.brandSub}>채용 예고편</span></div><div className={styles.location}><span aria-hidden="true">⌂</span> 사수 오피스 <span className={styles.locationDot} /> 첫 출근</div><span className={styles.badge}>합성 사례 · 1인 체험</span></header>
    {screen === "finished" ? <section className={styles.finished}>
      <p className={styles.eyebrow}>오늘의 오피스 체험 완료</p><h1>당신은 어떤 팀에서<br />일하고 싶나요?</h1><p>세 가지 결정에 담긴 나의 기준을 돌아보세요. 점수나 정답은 없습니다.</p>
      {results.map((_, index) => <article key={scenarios[index].id}><h2>{index + 1}. {scenarios[index].title}</h2>{comparison(index)}</article>)}<button className={styles.primary} onClick={restart}>처음부터 다시 체험하기</button><p className={styles.notice}>다시 체험하거나 새로고침하면 이 기록은 사라집니다.</p>
    </section> : <div className={styles.stage}>
      <div className={styles.canvasLayer} hidden={mode === "list" && screen === "play"}><TrailerOffice ref={office} paused={screen !== "play" || overlay !== null || mode === "list"} resetKey={quest + (screen === "intro" ? 100 : 0)} color={characters[character].color} discoveredPlaces={scenario.facts.filter((fact) => discovered.includes(fact.id)).map((fact) => fact.place)} onInteract={visit} /></div>
      {screen === "intro" ? <section className={styles.welcome}>
        <div className={styles.welcomeChip}>당신의 첫 출근을 환영해요</div><h1>일하는 방식을,<br />먼저 만나보세요.</h1><p>오피스를 걸으며 동료에게 묻고,<br />당신의 첫 번째 결정을 내려보세요.</p>
        <fieldset className={styles.characterPicker}><legend>나의 캐릭터</legend>{characters.map((entry, index) => <button type="button" key={entry.name} aria-label={entry.name} aria-pressed={character === index} onClick={() => setCharacter(index)} style={{ "--shirt": entry.color } as CSSProperties}><span className={styles.avatarPreview}><i /><b /><em /></span></button>)}</fieldset>
        <button className={styles.enter} onClick={() => setScreen("play")}>오피스 입장하기 <span>→</span></button><div className={styles.welcomeFacts}><span>3가지 결정</span><span>자유로운 탐색</span><span>채점 없음</span></div><p className={styles.notice}>회사·동료·사례는 모두 가상입니다. 답변은 전송·저장하지 않으며 새로고침하면 초기화됩니다.</p>
      </section> : <>
        <aside className={styles.questHud} aria-label="오늘의 퀘스트"><div className={styles.questMeta}><span className={styles.questSymbol}>✦</span><span>오늘의 퀘스트</span><b>{quest + 1} / 3</b></div><h1>{scenario.title}</h1><p>{scenario.summary}</p><div className={styles.questSteps}><span data-done={discovered.length > 0}>단서 찾기</span><i /><span data-done={Boolean(submitted)}>결정 남기기</span><i /><span>돌아보기</span></div></aside>
        <nav className={styles.gameNav} aria-label="체험 메뉴"><button onClick={() => setOverlay("notebook")}><span aria-hidden="true">▤</span>단서 수첩 <b>{discovered.length}</b></button><button onClick={() => setOverlay("destinations")}><span aria-hidden="true">⌖</span>장소 찾아가기</button><button onClick={() => setMode((current) => current === "map" ? "list" : "map")}><span aria-hidden="true">☷</span>{mode === "map" ? "목록형 모드로 전환" : "맵 모드로 전환"}</button></nav>
        {mode === "list" ? <div className={styles.listMode}><h2>오피스 장소</h2><p>같은 이야기와 단서를 목록으로 만날 수 있어요.</p><nav className={styles.placeList} aria-label="오피스 장소">{INTERACTIONS.map((entry) => <button key={entry.id} onClick={() => visit(entry.id)}><span className={styles.placeIcon} style={{ background: entry.color }}>{entry.person ? entry.person.slice(0, 1) : "◇"}</span><span><b>{entry.name}</b><small>{entry.detail}</small></span><span>→</span></button>)}</nav></div> : null}
        <div className={styles.playerBadge}><span className={styles.playerDot} style={{ background: characters[character].color }} /><div><b>나 · 오늘의 담당자</b><span>가상 동료와 함께하는 체험</span></div><button aria-label="체험 초기화" onClick={restart}>↻</button></div>
      </>}
    </div>}
    <dialog ref={modal} className={styles.modal} onCancel={(event) => { event.preventDefault(); setOverlay(null); }} aria-labelledby="trailer-dialog-title">
      <div className={styles.modalHeader}><div className={styles.speakerIcon} style={{ background: overlay === "place" ? currentPlace.color : "#a4bea7" }}>{overlay === "place" && currentPlace.person ? currentPlace.person.slice(0, 1) : overlay === "notebook" ? "▤" : "◇"}</div><div><span className={styles.eyebrow}>{overlay === "place" ? currentPlace.person ? `가상 동료 · ${currentPlace.name}` : currentPlace.detail : "나의 오피스 탐색"}</span><h2 ref={heading} id="trailer-dialog-title" tabIndex={-1}>{overlay === "place" ? currentPlace.person ? `${currentPlace.person} · ${currentPlace.name}` : currentPlace.name : overlay === "notebook" ? "단서 수첩" : "어디로 가볼까요?"}</h2></div><button className={styles.close} onClick={() => setOverlay(null)} aria-label="닫고 오피스로 돌아가기">×</button></div>
      <div className={styles.modalBody}>{overlay === "notebook" ? notebook() : overlay === "destinations" ? <><p className={styles.muted}>장소를 고르면 캐릭터가 길을 찾아 걸어갑니다.</p><nav className={styles.destinations} aria-label="찾아갈 장소">{INTERACTIONS.map((entry) => <button key={entry.id} onClick={() => mode === "map" ? walkTo(entry.id) : visit(entry.id)} aria-label={`${entry.name}로 걸어가기`}><span style={{ color: entry.color }}>●</span><b>{entry.name}</b><small>{entry.detail}</small><span>→</span></button>)}</nav></> : overlay === "place" ? <section aria-label="장소 상세">{placeContent()}</section> : null}</div>
    </dialog>
  </main>;
}
