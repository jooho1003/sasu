import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Role = {
  name: string;
  voice: string;
  rate: number;
  volume: number;
};

type Phase = {
  topic: string;
  goal: string;
  metric: string;
  risk: string;
  decision: string;
  owner: string;
};

type Segment = Role & {
  index: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
};

const ROOT = resolve(process.cwd());
const outputDir = resolve(ROOT, "outputs/mockup-data");
const fixtureDir = resolve(ROOT, "fixtures/mockup");
const audioPath = resolve(outputDir, "기획팀-9월-런칭-결정회의-30분.mp3");
const vttPath = resolve(fixtureDir, "기획팀-9월-런칭-결정회의-30분.vtt");
const ttsScript = resolve(ROOT, "scripts/synthesize-meeting-audio.ps1");
const manifestPath = resolve(outputDir, ".meeting-audio-manifest.json");

const roles: Role[] = [
  { name: "김현우 팀장", voice: "Microsoft Heami Desktop", rate: -2, volume: 100 },
  { name: "박서윤 과장", voice: "Microsoft Heami Desktop", rate: 0, volume: 96 },
  { name: "이준호 대리", voice: "Microsoft Heami Desktop", rate: 2, volume: 100 },
  { name: "최민지 사원", voice: "Microsoft Heami Desktop", rate: 4, volume: 94 },
  { name: "정다은 인턴", voice: "Microsoft Heami Desktop", rate: -4, volume: 92 },
];

const phases: Phase[] = [
  {
    topic: "런칭 목표와 범위",
    goal: "유료 베타에서 결정 카드와 원장까지 사용자가 한 번에 경험하는 것",
    metric: "인터뷰 12건 중 8건에서 결정 기록의 필요성이 확인된 것",
    risk: "기능 범위가 넓어져 9월 27일 일정이 밀리는 것",
    decision: "결정 카드·원장·Slack 알림만 베타 범위에 포함하는 것",
    owner: "이준호 대리",
  },
  {
    topic: "핵심 고객과 문제 정의",
    goal: "중견 SaaS 회사의 기획팀이 흩어진 결정을 다시 찾는 시간을 줄이는 것",
    metric: "기획 리드 6명 중 5명이 지난달 결정 근거를 찾는 데 10분 이상 쓴 것",
    risk: "모든 부서를 한 번에 지원하려다 기획팀의 핵심 문제를 놓치는 것",
    decision: "첫 고객을 20명에서 80명 규모의 기획팀으로 한정하는 것",
    owner: "박서윤 과장",
  },
  {
    topic: "온보딩과 동의 흐름",
    goal: "팀장이 부서를 만들고 멤버 동의를 확인한 뒤 바로 Slack을 연결하는 것",
    metric: "첫 설정을 10분 안에 끝내야 한다는 사용성 테스트 결과",
    risk: "동의하지 않은 발언이 저장되어 신뢰를 잃는 것",
    decision: "채널 연결보다 멤버 동의를 먼저 받고 미동의 발언은 저장하지 않는 것",
    owner: "최민지 사원",
  },
  {
    topic: "Slack 수집과 분류",
    goal: "결정 신호는 카드로 올리고 액션과 정보는 업무 흐름에 맞게 구분하는 것",
    metric: "샘플 메시지 40건에서 결정 후보 9건과 액션 후보 14건이 확인된 것",
    risk: "질문이나 잡담을 결정 카드로 만들어 팀 피로도가 높아지는 것",
    decision: "규칙 신호를 먼저 적용하고 확신이 낮은 카드는 팀장 검토로 보내는 것",
    owner: "이준호 대리",
  },
  {
    topic: "회의와 음성 기록",
    goal: "30분 회의가 끝난 뒤 5분 안에 결정·보류·액션을 확인하는 것",
    metric: "5명 회의에서 18개의 핵심 발언과 4개의 후속 작업이 나온 것",
    risk: "화자나 시간 정보가 사라져 인용 근거를 확인할 수 없는 것",
    decision: "화자·시각이 포함된 전사를 저장하고 모든 요약 항목을 원문에 연결하는 것",
    owner: "정다은 인턴",
  },
  {
    topic: "권한과 인용",
    goal: "질문자의 멤버십 범위 안에서만 답하고 좁은 문서는 리드에게만 보이는 것",
    metric: "권한 테스트 18개 중 카드·검색·Q&A 경로 모두에서 RLS가 차단한 것",
    risk: "화면에서 숨긴 정보가 API나 검색 결과로 노출되는 것",
    decision: "can_see 함수를 RLS와 검색 경로의 단일 판정 기준으로 유지하는 것",
    owner: "김현우 팀장",
  },
  {
    topic: "문서와 숫자 근거",
    goal: "예산안 엑셀과 의사결정 PPT의 숫자를 Slack·회의 맥락과 함께 찾는 것",
    metric: "예산안 3개 시나리오와 PPT의 우선순위 표가 같은 결론을 가리킨 것",
    risk: "파일 이름만 저장하고 실제 근거 문장을 연결하지 못하는 것",
    decision: "문서도 source와 item으로 저장하고 카드 인용에 원문을 포함하는 것",
    owner: "박서윤 과장",
  },
  {
    topic: "출시 실험과 KPI",
    goal: "카드가 실제 결정을 빠르게 만드는지 확인할 수 있는 지표를 갖는 것",
    metric: "카드 생성부터 결정까지의 중앙값을 24시간에서 4시간으로 줄이는 목표",
    risk: "카드 수만 늘고 실제 결정 속도나 재검색 성공률은 좋아지지 않는 것",
    decision: "리드타임·인용 클릭률·재질문 해결률을 첫 주 KPI로 기록하는 것",
    owner: "최민지 사원",
  },
  {
    topic: "운영과 실패 대응",
    goal: "임베딩이나 LLM이 실패해도 사용자가 영원한 스피너를 보지 않는 것",
    metric: "실패 job을 2분 스윕 안에 error_code와 함께 정리하는 운영 시나리오",
    risk: "외부 API 장애가 조용히 누락되어 팀이 분석 결과를 믿는 것",
    decision: "행을 먼저 만들고 재시도·실패 상태·수동 전사 업로드를 함께 제공하는 것",
    owner: "이준호 대리",
  },
  {
    topic: "최종 결정과 다음 주 실행",
    goal: "9월 27일 베타 공개와 10월 첫 고객 인터뷰를 동시에 지키는 것",
    metric: "오늘 확정할 결정 4건과 다음 주 액션 7건이 담당자와 마감일을 가진 것",
    risk: "결정은 했지만 담당자와 확인 시점이 없어 다시 논의하는 것",
    decision: "베타 범위·예산 1,200만원·회의 전사 경로·고객 인터뷰 일정을 확정하는 것",
    owner: "김현우 팀장",
  },
];

function sentence(role: Role, phase: Phase, round: number): string {
  if (role.name === "김현우 팀장") {
    if (round === 0) return `${phase.topic}부터 정리하겠습니다. ${phase.goal}을 이번 회의의 성공 기준으로 두고, ${phase.decision}까지 오늘 확정하죠.`;
    if (round === 1) return `지금 쟁점은 ${phase.risk}입니다. ${phase.metric}을 근거로 범위를 줄일지, 추가 검증을 할지 각자 의견을 주세요.`;
    return `정리하면 ${phase.decision}으로 결정합니다. ${phase.owner}가 담당하고 내일 오전까지 첫 결과를 공유해 주세요.`;
  }
  if (role.name === "박서윤 과장") {
    if (round === 0) return `${phase.topic} 관련 현재 자료를 보면 ${phase.metric}입니다. 운영 관점에서는 ${phase.goal}을 지키려면 ${phase.decision}이 필요합니다.`;
    if (round === 1) return `다만 ${phase.risk}은 일정과 비용에 바로 영향을 줍니다. 이번 주에는 검증 범위를 좁히고, 다음 회의에서 숫자로 다시 확인하겠습니다.`;
    return `실행 항목은 ${phase.owner}와 제가 나눠서 관리하겠습니다. 근거 문서와 회의 기록을 연결해 담당자가 바뀌어도 같은 결론을 볼 수 있게 하겠습니다.`;
  }
  if (role.name === "이준호 대리") {
    if (round === 0) return `구현은 ${phase.decision}을 기준으로 잡겠습니다. ${phase.goal}에 필요한 화면과 API를 먼저 만들고, ${phase.risk}은 별도 후속 작업으로 분리하겠습니다.`;
    if (round === 1) return `기술적으로는 원본 item과 인용을 멱등하게 저장해야 합니다. ${phase.metric}을 확인할 수 있도록 상태와 실패 코드를 남기겠습니다.`;
    return `제가 ${phase.owner}와 함께 오늘 결정된 항목을 티켓으로 쪼개겠습니다. 막히는 외부 연동은 수동 전사와 재시도 경로로 대체해 일정 리스크를 줄이겠습니다.`;
  }
  if (role.name === "최민지 사원") {
    if (round === 0) return `사용자 흐름에서는 ${phase.goal}이 중요합니다. 첫 화면에서 ${phase.decision}을 이해할 수 있도록 카드 문구와 원문 링크를 같이 보여주겠습니다.`;
    if (round === 1) return `테스트 참여자들은 ${phase.risk}을 가장 걱정했습니다. 그래서 동의 상태, 진행 중, 실패, 완료를 화면에서 구분하고 사용자가 다음 행동을 알 수 있게 하겠습니다.`;
    return `제가 화면 카피와 시나리오를 정리하고 ${phase.metric}을 다시 검증하겠습니다. 실제 사용자가 근거를 클릭했을 때 Slack과 원장까지 자연스럽게 이어지는지 확인하겠습니다.`;
  }
  if (round === 0) return `조사 메모에는 ${phase.metric}이라는 신호가 있습니다. ${phase.risk} 가능성도 있어 ${phase.decision} 전에 ${phase.goal}을 확인할 수 있는 사례를 더 모으겠습니다.`;
  if (round === 1) return `회의와 문서를 비교해 보니 같은 결정도 표현이 조금씩 달랐습니다. 원문 인용을 남기면 ${phase.topic}의 변경 이유를 나중에 다시 추적할 수 있습니다.`;
  return `제가 회의 전사와 문서 근거를 대조해 담당자와 마감일을 표로 만들겠습니다. ${phase.owner}에게 확인받은 뒤 다음 회의 전에 누락된 근거가 없는지 공유하겠습니다.`;
}

function toVttTime(seconds: number): string {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}.000`;
}

const segments: Segment[] = [];
for (const phase of phases) {
  for (let round = 0; round < 3; round += 1) {
    for (const role of roles) {
      const index = segments.length;
      segments.push({
        ...role,
        index,
        startSeconds: index * 12,
        endSeconds: (index + 1) * 12,
        text: sentence(role, phase, round),
      });
    }
  }
}

if (segments.length !== 150) {
  throw new Error(`expected 150 segments, received ${segments.length}`);
}

mkdirSync(outputDir, { recursive: true });
mkdirSync(fixtureDir, { recursive: true });

const vtt = [
  "WEBVTT",
  "",
  ...segments.flatMap((segment) => [
    `${toVttTime(segment.startSeconds)} --> ${toVttTime(segment.endSeconds)}`,
    `${segment.name}: ${segment.text}`,
    "",
  ]),
].join("\n");
writeFileSync(vttPath, vtt, "utf8");
writeFileSync(manifestPath, `\uFEFF${JSON.stringify(segments)}`, "utf8");

const result = spawnSync(
  "powershell.exe",
  ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ttsScript, "-Manifest", manifestPath, "-Output", audioPath],
  { stdio: "inherit" },
);

try {
  unlinkSync(manifestPath);
} catch {
  // The manifest is only an intermediate input for the local TTS step.
}

if (result.status !== 0) {
  throw new Error(`audio synthesis failed with exit code ${result.status ?? "unknown"}`);
}

const audioBytes = readFileSync(audioPath).byteLength;
console.log(JSON.stringify({
  audioPath,
  vttPath,
  durationSeconds: segments.at(-1)?.endSeconds,
  segmentCount: segments.length,
  participantCount: roles.length,
  audioBytes,
}));
