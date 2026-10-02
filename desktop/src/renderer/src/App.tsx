import { useCallback, useEffect, useRef, useState } from "react";
import type { CompanionInbox } from "@sasu/contracts";
import type {
  Answer,
  Card,
  DesktopSettings,
} from "../../shared/contracts";
import { AskTab } from "./components/AskTab";
import { CardsTab } from "./components/CardsTab";
import { HistoryTab } from "./components/HistoryTab";
import { LoginFlow } from "./components/LoginFlow";
import { SettingsTab } from "./components/SettingsTab";
import { WorkTab } from "./components/WorkTab";
import { PetCanvas } from "./pet/PetCanvas";
import { message } from "../../shared/messages";
import "./app.css";

type Tab = "ask" | "cards" | "history" | "work" | "settings";
type Screen = "loading" | "email" | "code" | "department" | "panel";
const tabs: readonly { id: Tab; label: string }[] = [
  { id: "ask", label: "질문" },
  { id: "cards", label: "결정함" },
  { id: "history", label: "기록" },
  { id: "work", label: "일 맡기기" },
  { id: "settings", label: "설정" },
];
export { message } from "../../shared/messages";

export function App() {
  const [session, setSession] = useState({ key: 0, signedOut: false });
  useEffect(() => window.sasu.auth.onSignedOut(() => {
    setSession((current) => ({ key: current.key + 1, signedOut: true }));
  }), []);
  return <SessionApp key={session.key} signedOut={session.signedOut} />;
}

function SessionApp({ signedOut }: { signedOut: boolean }) {
  const petWindow = location.hash === "#pet";
  const [screen, setScreen] = useState<Screen>(petWindow ? "panel" : signedOut ? "email" : "loading");
  const active = useRef(true);
  const inboxGeneration = useRef(0);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; inboxGeneration.current += 1; };
  }, []);
  const [tab, setTab] = useState<Tab>("ask");
  const [context, setContext] = useState<Awaited<
    ReturnType<typeof window.sasu.link.get>
  > | null>(null);
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [inbox, setInbox] = useState<CompanionInbox | null>(null);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [inboxError, setInboxError] = useState("");
  const inboxRequest = useRef<Promise<CompanionInbox | null> | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [answerQuestion, setAnswerQuestion] = useState("");
  const [card, setCard] = useState<Card | null>(null);
  const [cardKey, setCardKey] = useState(0);
  const [workKey, setWorkKey] = useState(0);
  const [notice, setNotice] = useState("");
  const [shortcut, setShortcut] = useState(true);
  const [petState, setPetState] = useState("idle");
  const [update, setUpdate] = useState<{ status: string; percent?: number }>({ status: "unavailable" });
  const questionFocus = useRef<() => void>(() => undefined);
  // Design Ref: desktop-recent-work §2 — share refreshes and discard expired session responses.
  const loadInbox = useCallback((): Promise<CompanionInbox | null> => {
    if (!active.current) return Promise.resolve(null);
    if (inboxRequest.current) return inboxRequest.current;
    const generation = inboxGeneration.current;
    const current = (): boolean => active.current && generation === inboxGeneration.current;
    setInboxLoading(true);
    setInboxError("");
    const request = window.sasu.inbox.get()
      .then(({ inbox: next }) => {
        if (!current()) return null;
        setInbox(next);
        return next;
      })
      .catch((cause) => {
        if (current()) { setInbox(null); setInboxError(message(cause)); }
        return null;
      })
      .finally(() => {
        if (inboxRequest.current === request) inboxRequest.current = null;
        if (current()) setInboxLoading(false);
      });
    inboxRequest.current = request;
    return request;
  }, []);
  // Design Ref: desktop-decision-flow §2 — mutation refresh must start after any pre-mutation read.
  const refreshAfterDecision = async (): Promise<CompanionInbox | null> => {
    const pending = inboxRequest.current;
    if (pending) {
      inboxGeneration.current += 1;
      await pending;
    }
    return active.current ? loadInbox() : null;
  };
  const rememberSeen = async (id: string, stillCurrent: () => boolean = () => true): Promise<void> => {
    if (!active.current || !stillCurrent()) return;
    try {
      const next = await window.sasu.settings.markSeen(id);
      if (active.current && stillCurrent()) setSettings(next);
    } catch (cause) {
      if (active.current && stillCurrent()) setNotice(message(cause));
    }
  };
  useEffect(() => {
    if (petWindow) {
      void window.sasu.settings
        .get()
        .then(setSettings)
        .catch(() => undefined);
      const removeState = window.sasu.window.onPetState(setPetState);
      const removeSettings = window.sasu.window.onPetSettings(setSettings);
      return () => {
        removeState();
        removeSettings();
      };
    }
    if (signedOut) return;
    void (async () => {
      try {
        setContext(await window.sasu.link.get());
        setSettings(await window.sasu.settings.get());
        setScreen("panel");
      } catch {
        setScreen("email");
      }
    })();
  }, [petWindow, signedOut]);
  useEffect(() => window.sasu.window.onShortcutStatus(setShortcut), []);
  useEffect(() => {
    void window.sasu.update.get().then(setUpdate).catch(() => undefined);
    return window.sasu.update.onStatus(setUpdate);
  }, []);
  useEffect(
    () =>
      window.sasu.window.onFocusQuestion(() => {
        setTab("ask");
        window.setTimeout(() => questionFocus.current(), 0);
      }),
    [],
  );
  useEffect(() => {
    if (screen !== "panel" || petWindow) return;
    void loadInbox();
    const timer = window.setInterval(loadInbox, 30_000);
    return () => window.clearInterval(timer);
  }, [screen, petWindow, loadInbox]);
  if (petWindow)
    return (
      <PetCanvas
        tone={settings?.pet ?? "green"}
        state={petState}
        reduceMotion={settings?.reduceMotion ?? false}
        onToggle={() => window.sasu.window.togglePanel()}
        onMove={(position) => void window.sasu.window.movePet(position)}
      />
    );
  if (screen !== "panel")
    return (
      <LoginFlow
        screen={screen}
        notice={notice}
        onNotice={setNotice}
        onScreen={setScreen}
        onLinked={async () => {
          setContext(await window.sasu.link.get());
          setSettings(await window.sasu.settings.get());
        }}
      />
    );
  return (
    <main className="shell">
      <header>
        <strong>사수</strong>
        <span>{context?.dept.name}</span>
        <button
          className="pin"
          onClick={() =>
            void window.sasu.settings
              .set({ panelPinned: !(settings?.panelPinned ?? false) })
              .then(setSettings)
          }
        >
          {settings?.panelPinned ? "고정 풀기" : "고정하기"}
        </button>
      </header>
      <nav>
        {tabs.map((item) => (
          <button
            key={item.id}
            className={tab === item.id ? "active" : ""}
            onClick={() => {
              setTab(item.id);
              setCard(null);
              if (item.id === "cards") setCardKey((key) => key + 1);
              if (item.id === "work") setWorkKey((key) => key + 1);
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <section className="content">
        {tab === "ask" && (
          <AskTab
            answer={answer}
            answerQuestion={answerQuestion}
            onQuestion={setAnswerQuestion}
            onAnswer={(next) => {
              setAnswer(next);
              if (next && next.status !== "pending") void rememberSeen(next.id);
            }}
            onNotice={setNotice}
            registerFocus={(focus) => {
              questionFocus.current = focus;
            }}
          />
        )}
        {tab === "cards" && (
          <CardsTab
            key={cardKey}
            card={card}
            inbox={inbox}
            loading={inboxLoading}
            error={inboxError}
            role={context?.role ?? "member"}
            onCard={setCard}
            onSeen={rememberSeen}
            onNotice={setNotice}
            onChanged={loadInbox}
            onProcessed={refreshAfterDecision}
          />
        )}
        {tab === "history" && (
          <HistoryTab
            onOpen={(entry, question) => {
              setAnswer(entry);
              setAnswerQuestion(question);
              void rememberSeen(entry.id);
              setTab("ask");
            }}
            onNotice={setNotice}
          />
        )}
        {tab === "work" && (
          <WorkTab
            key={workKey}
            lead={context?.role === "lead"}
            deptId={context?.dept.id ?? ""}
            onNotice={setNotice}
            onSeen={rememberSeen}
            inbox={inbox}
            loading={inboxLoading}
            error={inboxError}
            onRefresh={loadInbox}
          />
        )}
        {tab === "settings" && (
          <SettingsTab
            context={context}
            settings={settings}
            shortcut={shortcut}
            update={update}
            onSettings={setSettings}
          />
        )}
        {notice ? <p className="notice">{notice}</p> : null}
      </section>
    </main>
  );
}
