import { useRef } from "react";
import { message } from "../App";
export function WorkTab({
  lead,
  onNotice,
}: {
  lead: boolean;
  onNotice: (value: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  if (!lead)
    return (
      <>
        <h1>일 맡기기</h1>
        <p>이 메뉴는 팀장만 사용할 수 있습니다.</p>
      </>
    );
  const upload = async (): Promise<void> => {
    const file = input.current?.files?.[0];
    if (!file) return;
    if (!/\.(vtt|txt)$/u.test(file.name)) {
      onNotice("문서와 음성 파일은 웹의 올린 자료에서 처리해 주세요.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      onNotice("파일이 커서 올린 자료에서 처리해 주세요.");
      return;
    }
    try {
      await window.sasu.upload.transcript({
        name: file.name,
        title: file.name,
        visibility: "dept",
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
      onNotice("회의 기록을 받았습니다.");
    } catch (cause) {
      onNotice(message(cause));
    }
  };
  return (
    <>
      <h1>일 맡기기</h1>
      <p>회의 기록 파일을 올리면 글로 정리합니다.</p>
      <input ref={input} type="file" accept=".vtt,.txt" />
      <button onClick={() => void upload()}>파일 올리기</button>
      <p className="notice">
        문서와 음성 파일, 영업 검토는 다음 단계에서 만듭니다.
      </p>
    </>
  );
}
