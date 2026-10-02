import { useState } from "react";
import { message } from "../App";
type Screen = "loading" | "email" | "code" | "department" | "panel";
export function LoginFlow({
  screen,
  notice,
  onNotice,
  onScreen,
  onLinked,
}: {
  screen: Screen;
  notice: string;
  onNotice: (value: string) => void;
  onScreen: (screen: Screen) => void;
  onLinked: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [departments, setDepartments] = useState<
    Awaited<ReturnType<typeof window.sasu.link.departments>>["departments"]
  >([]);
  const requestCode = async (): Promise<void> => {
    try {
      onScreen("code");
      await window.sasu.auth.requestCode(email);
      onNotice("로그인 코드를 보냈습니다.");
    } catch (cause) {
      onScreen("email");
      onNotice(message(cause));
    }
  };
  const verifyCode = async (): Promise<void> => {
    try {
      await window.sasu.auth.verifyCode(email, code);
      setDepartments((await window.sasu.link.departments()).departments);
      onScreen("department");
    } catch (cause) {
      onNotice(message(cause));
    }
  };
  const link = async (dept: {
    id: string;
    consented: boolean;
  }): Promise<void> => {
    if (!dept.consented) {
      onNotice("웹에서 먼저 동의해 주세요.");
      void window.sasu.app.openWeb(`/consent?next=/d/${dept.id}`);
      return;
    }
    try {
      await window.sasu.link.create({
        dept_id: dept.id,
      });
      await onLinked();
      onScreen("panel");
    } catch (cause) {
      onNotice(message(cause));
    }
  };
  if (screen === "loading") return <main className="shell">불러오는 중…</main>;
  if (screen === "email")
    return (
      <main className="shell auth">
        <h1>사수 시작하기</h1>
        <p>이메일로 받은 코드로 로그인합니다.</p>
        <label>
          이메일
          <input
            value={email}
            type="email"
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <button onClick={() => void requestCode()}>코드 받기</button>
        {notice ? <p className="notice">{notice}</p> : null}
      </main>
    );
  if (screen === "code")
    return (
      <main className="shell auth">
        <h1>코드 확인</h1>
        <label>
          6자리 코드
          <input
            value={code}
            inputMode="numeric"
            maxLength={6}
            onChange={(event) => setCode(event.target.value)}
          />
        </label>
        <button onClick={() => void verifyCode()}>로그인하기</button>
        {notice ? <p className="notice">{notice}</p> : null}
      </main>
    );
  return (
    <main className="shell auth">
      <h1>부서 고르기</h1>
      {departments.map((dept) => (
        <button
          className="department"
          key={dept.id}
          data-dept-id={dept.id}
          onClick={() => void link(dept)}
        >
          {dept.name}
          {!dept.consented ? " · 웹에서 동의 필요" : ""}
        </button>
      ))}
      {notice ? <p className="notice">{notice}</p> : null}
    </main>
  );
}
