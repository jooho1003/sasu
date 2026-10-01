import type { DesktopSettings } from "../../../shared/contracts";
export function SettingsTab({
  context,
  settings,
  shortcut,
  update,
  onSettings,
}: {
  context: Awaited<ReturnType<typeof window.sasu.link.get>> | null;
  settings: DesktopSettings | null;
  shortcut: boolean;
  update: { status: string; percent?: number };
  onSettings: (settings: DesktopSettings) => void;
}) {
  const pet = settings?.pet ?? "green";
  return (
    <>
      <h1>설정</h1>
      <p>연결한 부서 · {context?.dept.name}</p>
      <label>
        펫 모양
        <select
          value={pet}
          onChange={(event) =>
            void window.sasu.settings
              .set({ pet: event.target.value as DesktopSettings["pet"] })
              .then(onSettings)
          }
        >
          <option value="green">초록</option>
          <option value="blue">파랑</option>
          <option value="purple">보라</option>
        </select>
      </label>
      <p>
        {shortcut
          ? "바로가기 키를 눌러 질문을 바로 열 수 있습니다."
          : "바로가기 키를 등록하지 못했습니다."}
      </p>
      <p>버전 · 0.1.0</p>
      <p>업데이트 · {update.status === "ready" ? "내려받음 · 앱을 닫으면 설치합니다" : update.status === "downloading" ? `내려받는 중 ${update.percent ?? 0}%` : update.status === "current" ? "최신 버전입니다" : update.status === "checking" ? "확인하는 중입니다" : update.status === "failed" ? "확인하지 못했습니다" : "설치판에서 확인합니다"}</p>
      <button onClick={() => void window.sasu.auth.signOut()}>
        로그아웃하기
      </button>
    </>
  );
}
