import { useEffect, useRef, useState } from "react";
import type { CompanionInbox } from "@sasu/contracts";
import type {
  Answer,
  Card,
  DesktopSettings,
  Questions,
} from "../../shared/contracts";
import { AskTab } from "./components/AskTab";
import { CardsTab } from "./components/CardsTab";
import { HistoryTab } from "./components/HistoryTab";
import { LoginFlow } from "./components/LoginFlow";
import { SettingsTab } from "./components/SettingsTab";
import { WorkTab } from "./components/WorkTab";
import { PetCanvas } from "./pet/PetCanvas";
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
export const message = (cause: unknown): string =>
  cause instanceof Error
    ? cause.message.split(":").slice(1).join(":") || cause.message
    : "요청을 처리하지 못했습니다. 잠시 뒤 다시 해 주세요.";

export function App() {
  const petWindow = location.hash === "#pet";
  const [screen, setScreen] = useState<Screen>(petWindow ? "panel" : "loading");
  const [tab, setTab] = useState<Tab>("ask");
  const [context, setContext] = useState<Awaited<
    ReturnType<typeof window.sasu.link.get>
  > | null>(null);
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [inbox, setInbox] = useState<CompanionInbox | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [history, setHistory] = useState<Questions["questions"]>([]);
  const [nextHistory, setNextHistory] = useState<Questions["next"]>(null);
  const [notice, setNotice] = useState("");
  const [shortcut, setShortcut] = useState(true);
  const [petState, setPetState] = useState("idle");
  const [update, setUpdate] = useState<{ status: string; percent?: number }>({ status: "unavailable" });
  const questionFocus = useRef<() => void>(() => undefined);
  const loadInbox = (): void => {
    void window.sasu.inbox
      .get()
      .then(({ inbox: next }) => setInbox(next))
      .catch(() => undefined);
  };
  const rememberSeen = async (id: string): Promise<void> => {
    const current = settings ?? await window.sasu.settings.get();
    const seen = [...current.seen.filter((value) => value !== id), id].slice(-500);
    const next = await window.sasu.settings.set({ seen });
    setSettings(next);
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
    void (async () => {
      try {
        setContext(await window.sasu.link.get());
        setSettings(await window.sasu.settings.get());
        setScreen("panel");
      } catch {
        setScreen("email");
      }
    })();
    return window.sasu.auth.onSignedOut(() => setScreen("email"));
  }, [petWindow]);
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
    loadInbox();
    const timer = window.setInterval(loadInbox, 30_000);
    return () => window.clearInterval(timer);
  }, [screen, petWindow]);
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
            onAnswer={(next) => {
              setAnswer(next);
              void rememberSeen(next.id);
            }}
            onNotice={setNotice}
            registerFocus={(focus) => {
              questionFocus.current = focus;
            }}
          />
        )}
        {tab === "cards" && (
          <CardsTab
            card={card}
            inbox={inbox}
            role={context?.role ?? "member"}
            onCard={setCard}
            onSeen={rememberSeen}
            onNotice={setNotice}
            onChanged={loadInbox}
          />
        )}
        {tab === "history" && (
          <HistoryTab
            entries={history}
            next={nextHistory}
            onEntries={setHistory}
            onNext={setNextHistory}
            onOpen={(entry) => {
              setAnswer(entry);
              void rememberSeen(entry.id);
              setTab("ask");
            }}
            onNotice={setNotice}
          />
        )}
        {tab === "work" && (
          <WorkTab
            lead={context?.role === "lead"}
            deptId={context?.dept.id ?? ""}
            onNotice={setNotice}
            onSeen={rememberSeen}
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
