# 사수(SASU) v3 — MVP PRD

> **부서별 결정 사수.** 부서 단위로 세팅된 AI가 슬랙·온라인 회의를 상시 관찰해 분류하고, 노션의 부서 원칙 문서를 근거로 삼아, "지금 결정해야 할 것"을 담당자에게 밀어주고, 물어보면 부서의 맥락과 과거 결정을 근거로 답하고, 내려진 결정을 원장에 기록한다. (노션 상시 관찰은 로드맵 — MVP는 원칙 문서 가져오기)
>
> - 문서 버전: 1.4 · 작성일: 2026-09-11 (마감까지 **9일**)
> - 지위: **구현의 입력이 되는 확정 계획.** 이 문서가 문서 체계의 최상위다. 범위와 완료 조건은 여기서 정하고, 구현 중 결정이 바뀌면 이 문서를 함께 고친다 — 특히 §3(기능), §8(범위·컷 라인), §4(기술 스택). 결정의 이유와 포기한 대안은 [ADR.md](ADR.md)에, 구조·불변식·테스트 경계는 [ARCHITECTURE.md](ARCHITECTURE.md)에 있다.
> - 문서 충돌 시 우선순위: **본 문서의 범위·완료 조건·컷 라인 → [ARCHITECTURE.md](ARCHITECTURE.md)의 구조·불변식 → [ADR.md](ADR.md)의 결정 이유 → [setup-guide.md](setup-guide.md)·[submission-checklist.md](submission-checklist.md)의 절차.** 하위 문서가 상위 문서를 암묵적으로 바꾸지 않는다. bkit PDCA용 `01-plan/`·`02-design/` 문서는 이 문서를 가리키는 어댑터이고 새 결정을 담지 않는다.
> - 대회: 원티드 AI Championship 2026 · **참가 접수 9/18(금) · 과제 제출 9/20(일) 23:59**
> - 개발 체제: 1인 · 기획 Claude · 구현 Codex (Harness `phases/` step 실행 — `.claude/commands/harness.md`)
> - 상위 문서: `proposal/사수_기획서_v3.html` (컨셉·경쟁·보안·심사 전략) · `submission/원티드 지원서.md` (양식·유의사항) · [submission-checklist.md](submission-checklist.md) (제출물·문안·스크린샷)
> - 대체된 문서: `archive/MVP_SPEC_v1.md`(v1, AI 팀원 평가 — 폐기) · `archive/sasumvp3weekplan_v2.1.md`(v2.1, 회의 중심 — §9 일정으로 대체) · `archive/sasusubmissionform_v2.1.md`·`archive/sasusubmissiondraft_v1.md`·`archive/sasuwantedsubmissionplan_v2.1.md`(v2.1 제출 문서 — 폰 녹음·화자 식별 서술이 v3와 어긋나 submission-checklist.md로 대체) · 루트 `plan.md`(plan-forge 확정 계획 — **1.0에서 이 문서가 흡수**, 원문은 Git `63b4134`)

> - 이력: **1.3 (2026-09-10)** — D2 임베딩을 Voyage AI `voyage-4-lite`(1024차원)로 재확정하고 provider 선택·재임베딩 마이그레이션을 추가(ADR-030). OpenAI 경로는 호환 옵션으로 보존한다.
> - 이력: **1.2 (2026-09-10)** — 임베딩을 OpenAI `text-embedding-3-small`(1536차원)으로 확정하고 `items.embedding`·`embed_model`·`search_as()`를 추가(ADR-029). S4 묻기, S5 채널·동의·회의 전사·Notion 가져오기, S6 게스트 시드 동선을 구현했다.
> - 이력: **1.1 (2026-09-08)** — LLM 공급자를 Anthropic에서 Groq으로 전면 교체(ADR-028). 카드·답변·회의 정리 `openai/gpt-oss-120b`, 분류 `openai/gpt-oss-20b`. §4·§6-2·§6-3·§6-5·§6-7·§6-9·§6-10·§8-4·§8-5·§9·§10·§11 갱신. §12 렌즈 반영 이력은 당시 기록이라 옛 모델명을 그대로 둔다. / **1.0 (2026-09-08)** — `plan.md`를 흡수하고 최상위 지위를 이관했다(ADR-001). plan §6 기술 결정 표 → ADR-002~027 · plan §8 보안 12조 → ARCHITECTURE §6 불변식 · plan §7 실패 경로 → §6-10(이미 있었음) · plan §11 비용 → §8-5 · plan §9 가설별 영향 → §10-1 · plan §10 검증 추가분 → §11 · plan §13 외부 리뷰 상세 → §12-1. 리포지토리 구조는 §6-11에서 ARCHITECTURE §2로 이관. / **0.x** — plan-forge Phase 2 PRD → Phase 3 렌즈 5개 → Phase 4 삭감 → Phase 5 외부 리뷰(Codex + 맥락 없는 세션) 반영 (§12).

>
> **표기 규칙** — `(확인 필요)`: 추측이거나 직접 확인이 필요한 사실. `미정`: 아직 결정하지 않은 것(빈칸이 아니라 결정 보류). 둘 다 §10에 모아 둔다.

---

## 0. 먼저 정한 다섯 가지

| # | 항목 | 결정 |
|---|---|---|
| 1 | **문제** | 부서의 결정이 슬랙·회의·문서에 흩어져 아무 시스템에도 기록되지 않는다. 팀장은 전달할 시간이 없고 팀원은 물어볼 곳이 없어, "말해주지 않았냐" 공방에 심판이 없다. |
| 2 | **타깃** | 회의는 많고 문서화는 약한 **5~50인 팀**의 팀장·팀원. MVP의 첫 부서는 **우리 팀 자신**(파일럿 1호). 두 번째 파일럿 팀은 `(확인 필요)` — 이번 주 섭외. |
| 3 | **가치** | 회의록·검색(커머디티)이 아니라 **결정 레이어**: 상시 분류 → 지금 결정 카드 + 방향 제안 → 부서별 결정 원장 → 권한 인지 Q&A. 그리고 "회사 전체"가 아니라 **부서 단위 격리**. |
| 4 | **화면** | 7개 (§5). 동의 · 대시보드 · 결정 카드(웹+슬랙) · 결정 원장 · 사수에게 묻기 · 부서 세팅 · 게스트 모드 |
| 5 | **핵심 흐름 5단계** | ① 부서 세팅(채널 연결·원칙 문서·결정권자) → ② 하루의 입력이 자동 분류된다 → ③ 담당자에게 결정 카드가 도착하고 카드에서 결정한다 → ④ 결정이 원장에 근거와 함께 남고 충돌이 감지된다 → ⑤ 사수에게 물으면 권한 안에서 인용해 답한다 |

---

## 1. 프로젝트 개요

### 1-1. 한 문장

> 범용 AI는 세상을 알고, Lindy는 회사를 안다고 말합니다. **사수는 우리 부서를 알고, 결정을 만듭니다.**

### 1-2. MVP의 유일한 목표

배포된 URL에서 아래 **데모 시나리오 5장면**이 끊김 없이 돌고, 심사 기간(9/21~10/5) 내내 접속이 유지되는 것.

| 장면 | 내용 | 시간 |
|---|---|---|
| 1 | **부서 세팅** — "우리 팀 사수"가 슬랙 채널 3개·회의·노션 원칙 문서에 연결된 완료 상태를 보여준다 | 30초 |
| 2 | **분류 대시보드** — 슬랙 N건·회의 1건·문서 변경 N건이 결정 필요 / 액션 / 정보 / 잡담으로 나뉜 화면. "수집·검색까지는 남들도 합니다"를 우리 입으로 말한다 | 30초 |
| 3 | **같은 결정 카드** — 슬랙 스레드에 묻힌 질문과 회의에서 보류된 안건이 **같은 형식의 카드**로 담당자에게. 마감·배경·과거 결정 충돌 인용·추천 방향. 카드에서 결정 → 원장 기록 | 60초 |
| 4 | **권한별로 다른 답** — 같은 질문을 팀장 계정과 팀원 계정으로. 팀장 답엔 경영회의 인용, 팀원 답엔 "권한 내 근거만". 옆에 범용 AI의 답을 나란히(게스트 모드: 시드 시 저장한 `generic_answer`, 6-7) | 60초 |
| 5 | **원장** — 결정 목록·리드타임·"과거 결정과 충돌" 배지. 파일럿 실데이터는 데모데이(10/17)용 | 30초 |
| 4' | **(게스트 모드 전용) 부서가 다르면 답이 다르다** — 같은 질문을 영업 사수·개발 사수에게. 각자 자기 부서 원칙을 인용. "회사 전체를 아는 AI"와의 구조적 차이를 데이터로 증명 | 30초 |

### 1-3. Definition of Done

- [ ] 데모 5장면이 로그인한 사용자 기준 5분 안에 완주 가능
- [ ] 게스트 모드: 로그인 없이 가상 회사 샘플 워크스페이스에서 대시보드·카드·원장·Q&A 열람 (30초 내)
- [ ] 우리 팀의 실제 슬랙 채널 1개 이상이 파이프라인을 통과하고 있음 (파일럿 1호 가동)
- [ ] 심사 기간 내내 배포 링크 정상 접속 (접속 불가 시 심사 제외 — `원티드 지원서.md` 유의사항)
- [ ] 제출서에 사용 AI 도구·활용 방식 기재 (필수 항목)
- [ ] **참가 접수는 D0(9/8)에 완료** — 양식 제출뿐이라 마감일(9/18)까지 미룰 이유가 없다

### 1-4. 성공 지표 (파일럿 기간 9/21~10/16, 데모데이 탄약)

- 분류된 항목 수 / 발송된 결정 카드 수 / 카드에서 실제 결정된 비율
- **결정 리드타임** (안건 발생 → 결정 기록까지). "도입 전" 데이터는 존재하지 않으므로 Δ는 **파일럿 1주차 vs 4주차**로 정의한다. 도입 전 비교를 말하려면 파일럿 팀 인터뷰의 정성 추정치뿐이다 `(확인 필요)`
- Q&A 질문 수와 인용 답변률 (인용 못 해서 답 안 한 비율 포함)

이 지표는 9/21 이후에야 쌓인다. **제출(9/20) 시점의 설득 근거는 데모 5장면과 게스트 모드뿐이며**, 지표는 데모데이(10/17)용이다. 제출서에서 지표를 약속하지 않는다.

---

## 2. 사용자 시나리오

### 2-1. 페르소나

| 역할 | 상황 | 사수가 주는 것 |
|---|---|---|
| **팀장 (결정권자)** | 회의에 갇혀 있고, 전달할 시간이 없다. 슬랙에서 자기에게 온 질문을 놓친다 | 결정이 필요한 것만 카드로 받는다. 카드에서 결정하면 전달·기록이 끝난다 |
| **팀원** | 물어볼 곳이 없다. 회의에 안 들어갔는데 결정을 몰라 일이 막힌다 | 사수에게 물으면 근거를 인용해 답한다. 인용 못 하면 "모른다"고 한다 |
| **관리자 (MVP에서는 팀장이 겸임)** | 무엇이 수집되는지, 누가 무엇을 봤는지 알아야 한다 | 수집 채널 목록 공개, 동의 상태, 감사 로그 |

### 2-2. 유저 스토리 10개

| # | 시점 | 스토리 |
|---|---|---|
| U1 | 팀장 | 부서 사수를 30분 안에 세팅하기 위해, 슬랙 채널·회의·노션 원칙 문서를 연결하고 결정권자를 지정하고 싶다 |
| U2 | 팀장 | 하루 수백 건 중 내가 봐야 할 것만 보기 위해, 슬랙·회의·문서 입력이 결정 필요/액션/정보/잡담으로 분류된 대시보드를 원한다 |
| U3 | 팀장 | 회의를 안 해도 결정을 미루지 않기 위해, 결정이 필요한 안건이 마감·배경·추천 방향과 함께 슬랙 DM 카드로 오기를 원한다 |
| U4 | 팀장 | 실수로 과거 원칙을 뒤집지 않기 위해, 새 결정이 과거 결정과 충돌하면 카드에서 지적받고 싶다 |
| U5 | 팀원 | 회의에 안 들어갔어도 결정을 놓치지 않기 위해, "왜 그렇게 정했죠?"라고 물으면 발언자·시각·문서를 인용해 답해주기를 원한다 |
| U6 | 팀원 | 물어볼 선배 없이도 방향을 잡기 위해, "이 견적 받아도 돼요?" 같은 질문에 부서 원칙과 선례를 근거로 추천 방향을 받고 싶다 |
| U7 | 팀원 | 슬랙에서 묻힌 내 질문이 답을 받기 위해, 사수가 그 질문을 결정 요청으로 승격해 담당자에게 보내주기를 원한다 |
| U8 | 팀원 | 내가 내린 작은 결정도 근거를 남기기 위해, 웹에서 직접 결정을 원장에 기록하고 싶다 |
| U9 | 관리자 | 감시 도구로 오해받지 않기 위해, 수집 중인 채널 목록과 구성원 동의 상태를 공개하고 언제든 채널을 뺄 수 있기를 원한다 |
| U10 | 관리자 | 정보가 새지 않았는지 확인하기 위해, 누가 무엇을 물었고 사수가 어떤 문서를 인용했는지 감사 로그를 보고 싶다 — **나중**: MVP는 `answers`에 기록만 하고 화면은 없음(§8-0) |

### 2-3. 대표 시나리오 — "외주사 B 견적"

1. 월요일 10시 주간회의(온라인, 봇 참석)에서 "외주사 B 견적 12% 인상 건"이 재무 회신 대기로 **보류**된다.
2. 같은 날 오후 팀원 A가 #프로젝트 채널에 "외주사 B 견적 받아도 돼요?"라고 묻지만 스크롤에 묻힌다.
3. 사수가 둘을 **같은 안건**으로 묶어 팀장에게 **지금 결정 카드** DM을 보낸다: 마감 오늘 17:00 · 배경(회의 34:12 발언 인용) · **"3월 14일 경영회의 §3 '연 10% 이상 인상 시 재입찰' 원칙과 충돌"** · 추천: 재입찰 검토.
4. 팀장이 카드에서 **[재입찰로 결정]**을 누르고 한 줄 사유를 적는다 → 원장에 기록, 스레드에 결정 공지, 팀원 A에게 멘션.
5. 수요일 팀원 B가 "외주사 B 어떻게 됐어요?"라고 사수에게 묻는다 → 원장 #57과 회의 발언을 인용해 답한다. 신입 C가 같은 질문을 하면 경영회의록 인용은 빠지고 원장 결정만 인용된다.

### 2-4. 유저 플로우 (유저 플로우 렌즈 반영)

세 진입점이 있다. 심사위원·투표자는 게스트로 들어오고, 팀장은 세팅으로, 팀원은 슬랙 공지에서 들어온다. 세 흐름은 모두 **결정 원장**에서 만난다.

```mermaid
flowchart TD
  subgraph G[게스트 — 심사위원·투표자]
    G0[랜딩 /] --> G1[/demo 대시보드 S1/]
    G1 --> G2[결정 카드 S2] --> G3[원장 S3] --> G4[묻기 S4: 준비된 질문 6개]
    G4 --> G5{자유 질문 시도}
    G5 -->|안내| G4
    G4 --> G6[CTA: 우리 팀에 깔기 → 파일럿 문의 / 투표 링크]
  end

  subgraph L[팀장 — 첫 세팅]
    L0[매직링크 로그인] --> L1{멤버십 있음?}
    L1 -->|없음| L9[초대가 필요합니다 화면 → 이탈]
    L1 -->|lead| L2[동의 화면: 수집 범위·감사 로그 고지]
    L2 --> L3[S5 세팅 체크리스트 0/4: 멤버 동의 수집이 0단계]
    L3 --> L4[채널 멤버 전원 동의 확인 → 슬랙 채널 선택 → 봇이 수집 공지 게시 → 7일 백필]
    L4 --> L5[회의 연결: 회의 URL 입력 or 전사 업로드]
    L5 --> L6[노션 원칙 문서 지정]
    L6 --> L7[S1 빈 대시보드: 첫 메시지 대기]
    L7 -.첫 슬랙 메시지 도착.-> D1
  end

  subgraph M[팀원 — 첫 접촉]
    M0[lead의 동의 요청 DM 또는 채널 공지] --> M1{동의 버튼}
    M1 -->|동의| M2[consented_at 기록]
    M1 -->|미동의| M3[그 사람의 발언은 저장하지 않음 - 어댑터에서 skip]
    M2 --> M4[@사수 질문 or 웹 로그인 → S4]
  end

  subgraph D[일상 루프]
    D1[입력 수집·분류 → S1] --> D2{결정 필요?}
    D2 -->|자동 승격| D3[결정 카드 생성 → 담당자 DM]
    D2 -->|확인 필요| D2b[lead가 S1에서 수동 승격] --> D3
    D3 --> D4{담당자 행동}
    D4 -->|결정 + 사유| D5[원장 기록 → 스레드 공지 → 질문자 멘션]
    D4 -->|보류| D6[deferred: 대시보드에 남음] -->|lead 재개| D3
    D4 -->|반려| D7[카드 닫힘, 원장에 '반려' 기록]
    D4 -->|무응답, 마감 경과| D8[대시보드·원장에 '마감 지남' 배지] --> D4
    D5 --> S3[원장 S3]
    M4 --> Q1[질문] --> Q2{근거 있음?}
    Q2 -->|있음| Q3[인용 답변 + 권한 고정 문구]
    Q2 -->|없음| Q4[모릅니다 → 카드로 보낼까요?] -->|예| D3
    Q3 --> Q5{실패?} -->|failed| Q6[원인 + 다시 시도] --> Q1
  end
```

**이탈 가능 지점과 되돌아오는 길**
- 팀장이 세팅 도중 이탈 → S5 체크리스트가 진행률을 기억한다. 채널 1개만 연결돼도 대시보드는 동작한다(회의·노션은 선택).
- 슬랙 DM 카드의 "자세히" 링크는 웹 로그인을 요구해 이탈이 생긴다 → **DM 카드 안에 결정에 필요한 전부(배경·근거·충돌·버튼)를 담고**, 웹 링크는 보조로만 둔다.
- 게스트가 자유 질문을 시도 → 막지만, 준비된 질문 6개 중 가장 가까운 것을 제안한다.
- 답변 실패 → 원인 + 재시도. 카드 DM 실패 → 웹 카드 + lead 알림 (6-10).

**이 렌즈로 새로 생긴 것** — 동의 흐름(팀원), 회의 탭(S1), 보류·마감 경과의 되돌아오는 길(D6·D8 — 리마인드 DM은 Phase 4에서 배지로 축소), 게스트 CTA, 슬랙 앱 설치를 MVP에서는 단일 워크스페이스 수동 설치로 고정(§8-1).

---

## 3. 핵심 기능 목록

**안정성 보완 (ADR-035):** 모든 워커 호출은 공통 핸들러 등록과 pending sweep을 거친다. 답변의 인용이 일부라도 실패하면 전체 초안을 1회 재생성하고, 재실패 시 자유 서술을 게시하지 않고 refused로 종료한다.

Slack 서명 검증·동의 확인·선마스킹 후에는 `ingest_slack_atomic()` 한 트랜잭션으로 이벤트 멱등 키·업무 row·job을 함께 저장한다. SQL 안에서도 소스 활성 상태와 멤버 동의를 재검증한다. 부분 실패는 전체 롤백하여 재전송을 허용한다. 미동의 원시 payload를 inbox에 저장하지 않는다.

### 제품 확장 목표 갱신 (2026-09-12, ADR-033)

**사용자 정정 및 분류 개선 (ADR-034):** 제출 전에 모두 반영할 문서는 `docs/submission/원티드 지원서.md`다. Lindy 기능 격차 분석의 전체 항목을 제출 필수로 오해하지 않는다. 신청·제출 양식의 요구와 기능 구현 증거는 `docs/submission-checklist.md`에서 추적한다. WATCH는 유효한 저장 항목 전부를 의미 분류하여 규칙 비후보의 결정 누락을 줄인다.

사용자 지시에 따라 장기 제품 기준을 **Lindy의 공개 기능군 흡수 + 부서 결정 흐름 고도화**로 확장한다. 기록·검색을 생략하고 결정 카드만 제공하는 것으로 경쟁 제품을 대체했다고 판단하지 않는다. 기능별 조사와 미구현 항목은 [Lindy 기능 격차 분석](verification/lindy-capability-gap.md)에 기록한다. 이 문서는 조사 자료이며 아래 MVP 범위를 독자적으로 변경하지 않는다.

흡수 완료는 기능 이름이나 화면 존재가 아니라 연결·권한·실행·실패 복구까지 포함한 시나리오 실행 기록으로 판정한다. Lindy 대비 우월성은 동일 입력·동일 권한의 비교 실험 전까지 주장하지 않는다.

기능의 서열이 곧 포지셔닝이다. 경쟁자 전원이 가진 것(기록·검색)은 **입력**으로 강등한다.

| 우선 | 기능 | 한 줄 정의 | 스토리 |
|---|---|---|---|
| P0 | **WATCH 상시 관찰·분류** | 슬랙·회의를 상시 수집하고 노션 원칙 문서를 가져와, 공통 스키마로 저장하고 결정 필요 / 액션 / 정보 / 잡담으로 분류 | U2 |
| P0 | **DECIDE 지금 결정 카드** | "결정 필요" 항목을 담당자에게 카드로 푸시(웹 + 슬랙 DM). 마감·배경·과거 결정 인용·추천 방향. 카드에서 결정 | U3, U7 |
| P0 | **LEDGER 결정 원장** | 누가·언제·왜·어떤 근거로 결정했는지 기록. 리드타임 자동 계산 | U8 |
| P0 | **ASK 권한 인지 Q&A** | 부서의 채널·문서·원장만을 근거로, 질문자 권한 안에서 인용해 답한다. 인용 못 하면 답하지 않는다 | U5, U6 |
| P0 | **VOICE ASK 음성 업무 입력** | 브라우저 음성을 한국어 전사하고, 사용자가 확인·수정한 뒤 기존 ASK/분류 흐름으로 보낸다. 원본 음성은 저장하지 않는다 | U5, U6 |
| P0 | **DOCUMENT ASSISTANT 문서 업무 정리** | lead가 TXT·MD·CSV·JSON·PDF·DOCX를 업로드하면 마스킹된 근거 chunk와 인용 가능한 요약·결정·액션·열린 질문을 만든다 | U2, U5, U6 |
| P1 | **충돌 감지** | 카드 생성 시 과거 원장과 충돌하면 배지 + 인용 (결정 후 재검사는 나중) | U4 |
| P0 | **부서 세팅** | 멤버 동의 수집(0단계) → 채널 연결·원칙 문서 지정·소스 visibility·결정권자 지정. 데모 장면 1이라 P0 | U1, U9 |
| P0 | **게스트 모드** | 로그인 없이 가상 회사 샘플 워크스페이스 열람. 심사·투표가 보는 것이라 P0 | — |
| 나중 | 감사 로그 뷰 | DB(`answers`)에는 기록, 화면은 나중 — Phase 4에서 제외 | U10 |
| 나중 | 인용 정합성 LLM 심판 | 문자열 포함 검증(1차)만. LLM 심판(2차)은 나중 — Phase 4에서 제외 | U5 |

**이번에 안 만드는 것** → §8 제약 사항 (Phase 4 삭감 결과는 §8-0).

---

## 4. 기술 스택

| 구성 | 선택 | 비고 |
|---|---|---|
| 프론트·API | **Next.js (App Router) + Vercel** | 대시보드·원장·Q&A·게스트 모드. Route Handler가 슬랙 이벤트 수신 |
| DB·인증·벡터 | **Supabase** (Postgres + pgvector + RLS + Auth) | RLS가 곧 권한 인지 답변의 물리적 구현. 부서 키로 네임스페이스 격리 |
| 슬랙 | **Slack Events API + Block Kit** (HTTP 모드) | 지정 채널 상시 수신, @사수 멘션·DM, 카드 버튼 인터랙션. 3초 내 200 응답 후 비동기 처리 |
| 음성·온라인 회의 | **Groq Whisper `whisper-large-v3-turbo`** 음성 업무 입력 + **Recall.ai** 류 회의 봇 API → 화자 라벨 전사 | 음성 업무 입력 원본은 저장하지 않는다. 회의 봇 실패 시 Zoom/Meet 기본 전사(.vtt/.txt) 업로드 |
| 노션 | **Notion API** — 지정 페이지 1회 가져오기 + [다시 가져오기] | 부서 원칙 문서. 폴링·웹훅은 나중(8-0) |
| 정리·답변·카드 | **Groq `openai/gpt-oss-120b`** + strict json_schema | 인용 스키마 강제. 인용 없는 문장은 파기 후 재생성. production 모델 중 strict structured output이 되는 둘 중 큰 쪽 (ADR-028) |
| 분류·검증 | **Groq `openai/gpt-oss-20b`** + 규칙 휴리스틱 | 결정·마감 감지는 규칙 우선, LLM은 정성 판단만. 분류도 structured output이므로 strict를 지원하는 모델이어야 한다 |
| 임베딩 | **Voyage AI `voyage-4-lite` · 1024차원** | 충돌 감지·Q&A 검색용. `input_type=query/document`를 구분하고 `embed_model`이 다른 행은 검색에서 제외. OpenAI `text-embedding-3-small`은 호환 provider로 보존 (ADR-030) |
| 비동기 처리 | **Postgres `jobs` 테이블 + `/api/jobs/run` 워커** (6-11). 요청은 job을 넣고 즉시 응답, 워커는 `after()`로 즉시 1회 + **매분 트리거** | 매분 트리거는 플랜에 따라 둘 중 하나로 D0에 확정: Vercel Cron(Pro) 또는 **Supabase `pg_cron` + `pg_net`이 `/api/jobs/run`을 HTTP 호출**(무료 티어, 외부 의존성 없음). 워커 코드는 트리거와 무관하게 동일 |
| 마스킹 | 정규식 선마스킹 (전화·이메일·주민번호·계좌) | Presidio 2차 마스킹은 **나중** |
| 개발 도구 | Codex (구현) · Claude (기획·리뷰) | 세션 로그를 제출서 "AI 활용" 부록으로 |

**환경 변수**: `GROQ_API_KEY`, `EMBEDDING_PROVIDER`(기본 `voyage`), `VOYAGE_API_KEY`, `EMBEDDING_MODEL`(기본 `voyage-4-lite`), `OPENAI_API_KEY`(호환 provider 선택 시), `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `NOTION_TOKEN`, `RECALL_API_KEY`(선택), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JOBS_TRIGGER_SECRET`. `NEXT_PUBLIC_` 두 개(Supabase URL·anon key)만 클라이언트에 노출되고 나머지는 서버 전용. 그 외 키가 클라이언트 번들에 들어가면 안 된다.

**결정 이유와 포기한 대안** → [ADR.md](ADR.md) ADR-003~020 (채널 3개 · 노션 1회 · 회의 봇 D6 판정 · Next.js · Supabase · jobs 워커 · 매분 트리거 · LLM 역할 분리 · structured output 순서 · 인용 문자열 검증 · 가시성 2단계 · 게시 위치 권한 · 이메일 매핑 · 단일 워크스페이스 · 임베딩 D2 · 게스트 합성 데이터 · 공동 키).

**착수 시점에 정해둔 것**
- 키 관리: MVP는 **공동 키 하나**(우리 팀 파일럿 + 게스트 모드). 사용자별 키는 나중.
- 비용 상한: 파일럿+심사 기간 **$100 이내** `(확인 필요: Recall.ai 별도)`. 게스트 모드는 사전 실행 스냅샷이라 $0.
- 도메인: `미정` — Vercel 기본 도메인으로 제출 가능하나, 공유 카드용 커스텀 도메인은 여유 시.

---

## 5. 화면 구성

| # | 화면 | 라우트 | 핵심 요소 | 스토리 |
|---|---|---|---|---|
| S1 | **부서 대시보드** | `/d/[dept]` | 오늘의 입력 카운트(슬랙/회의/문서) · 분류별 탭(결정 필요/액션/정보/잡담/분류 대기) · **회의 탭**(회의별 정리·보류 안건·봇 상태) · 항목 클릭 → 원문 · "카드로 승격" 버튼 | U2, U7 |
| S2 | **결정 카드** (웹 상세 + 슬랙 DM) | `/d/[dept]/cards/[id]` + Slack Block Kit | "지금 결정" 배지 · 마감 · 배경 · 근거 인용(원문 링크) · 충돌 경고 · 추천 방향 · [결정 / 보류 / 반려] + 사유 입력 | U3, U4 |
| S3 | **결정 원장** | `/d/[dept]/ledger` | 결정 목록(상태·담당자·리드타임) · 상세(누가·언제·왜·근거 링크) · 충돌 배지 · "직접 기록" 버튼 | U8, U4 |
| S4 | **사수에게 묻기** | `/d/[dept]/ask` + 슬랙 @멘션 | 텍스트·음성 질문 입력 · 인용 붙은 답변(발언자·시각·문서) · "내 권한 범위 안의 기록만 참고" 고정 문구 · 인용 불가 시 "모릅니다 → 카드로 보낼까요?" | U5, U6 |
| S5 | **부서 세팅** | `/d/[dept]/settings` | **온보딩 체크리스트(멤버 동의·채널·회의·원칙 문서 4단계)** · 슬랙 채널 선택(단일 워크스페이스, 앱은 수동 설치) · 회의 연결(회의 URL 입력 or 전사 업로드) · 노션 원칙 문서 · 결정권자 · 소스별 visibility · 동의 상태 · 이번 달 LLM 사용액 | U1, U9 |
| S6 | **게스트 모드** | `/demo` | 가상 회사 "온새미로 주식회사" 워크스페이스를 S1→S2→S3→S4 순으로 읽기 전용 렌더. Q&A는 사전 실행 응답 세트 + 범용 AI 답 나란히. 끝에 CTA(파일럿 문의·투표 링크) | 심사·투표 동선 (스토리 밖) |
| S0 | **동의 화면** (첫 로그인) | `/consent` | 수집 범위·원장 인용 보존·질문 기록 고지 · [동의] → `consented_at`. 슬랙 DM의 [동의] 버튼과 같은 기록 | U9 |
| S7 | **문서 어시스턴트** | `/d/[dept]/documents` | lead 문서 업로드 · 문서 처리 상태 · 권한별 요약·결정·액션·열린 질문 · 원문 인용 · 문서 기반 ASK 진입 | U2, U5, U6 |

S6은 유저 스토리가 아니라 심사 동선을 위한 화면이다. S7은 문서 업무 정리를 위한 P0 화면이다. 음성 생체 식별이나 화자 지문 등록 화면은 만들지 않는다 (§8).

---

## 6. 상세 기능 명세

### 6-1. 데이터 모델 (Supabase Postgres)

```sql
-- 조직·부서·사람
create table orgs        (id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz default now());
create table departments (id uuid primary key default gen_random_uuid(), org_id uuid references orgs not null,
                          name text not null, template text not null default 'general',   -- general (MVP 1종)
                          created_at timestamptz default now());
create table members     (user_id uuid references auth.users on delete cascade not null, dept_id uuid references departments not null,
                          role text not null default 'member',                              -- lead|member
                          display_name text not null,                                       -- 원장·인용 표시용 스냅샷의 원본
                          slack_user_id text unique,                                        -- 이메일 일치로 세팅 시 매핑
                          consented_at timestamptz, consent_version int,                    -- 동의문 개정 시 재동의 판별
                          primary key (user_id, dept_id));
alter table orgs add column is_demo boolean not null default false;                        -- 게스트 모드 판별은 이름이 아니라 이 플래그

-- 입력 소스와 항목 (모든 채널의 공통 스키마)
create table sources (id uuid primary key default gen_random_uuid(), dept_id uuid references departments not null,
                      kind text not null,                 -- slack_channel|meeting|notion_page|document
                      external_id text not null,          -- 채널 ID / 회의 ID / 페이지 ID
                      title text, visibility text not null default 'dept',   -- dept|leads_only
                      is_principles boolean not null default false,          -- 부서 원칙 문서 (departments 배열 대신 여기 플래그)
                      sync_cursor text,                   -- 노션 last_edited_time / 슬랙 마지막 ts (재시작 시 이어받기)
                      last_synced_at timestamptz, last_error text,           -- 세팅 화면 "마지막 동기화" 표시용
                      active boolean default true, created_at timestamptz default now());
create table meetings (id uuid primary key default gen_random_uuid(), source_id uuid references sources not null,
                      dept_id uuid references departments not null,
                      meeting_url text, status text not null default 'scheduled',
                      -- scheduled|bot_joined|bot_failed|transcribed|summarized|summary_failed
                      status_reason text, started_at timestamptz,
                      summary jsonb,                      -- {decisions[], deferred[], actions[]} 각 항목에 item_id 인용
                      created_at timestamptz default now());
create table document_summaries (source_id uuid primary key references sources on delete cascade,
                      dept_id uuid references departments not null,
                      status text not null default 'processing', -- processing|summarized|summary_failed
                      summary jsonb, status_reason text,
                      extracted_chars int not null default 0, chunk_count int not null default 0,
                      created_at timestamptz default now(), updated_at timestamptz default now());
create table items   (id uuid primary key default gen_random_uuid(), source_id uuid references sources not null,
                      dept_id uuid references departments not null,
                      external_ref text,                  -- slack ts / 전사 구간 / notion block id
                      author_ext_id text,                 -- 슬랙 user id / 전사 화자 라벨. 어댑터가 동의 여부를 판별하는 키(미동의면 저장 안 함)
                      author text, spoken_at timestamptz, content text not null,   -- author는 당시 표시명 스냅샷, content는 마스킹 후 본문
                      embedding vector(1024), embed_model text, -- D2 확정 모델을 별도 마이그레이션으로 추가. 모델이 바뀌면 embed_model이 다른 행은 검색에서 제외
                      embed_status text not null default 'pending',   -- pending|done|failed (실패는 재시도 큐)
                      deleted_at timestamptz,             -- 원문 삭제·채널 제거 시 소프트 삭제 (인용 유지용)
                      created_at timestamptz default now(),
                      unique (source_id, external_ref));  -- 슬랙 재전송·폴링 중복 방지
create table ingest_events (event_id text primary key, received_at timestamptz default now());   -- 슬랙 event_id 멱등 처리
create table classifications (item_id uuid references items primary key,
                      label text not null,                -- decision|action|info|chatter|unclassified (LLM 실패 시)
                      method text not null,               -- rule|llm
                      confidence numeric, deadline_hint timestamptz, assignee_hint text, reasoning text);

-- 결정 요청 카드와 원장
create table decision_requests (id uuid primary key default gen_random_uuid(), dept_id uuid references departments not null,
                      title text not null, background text not null, recommendation text,
                      deadline timestamptz, assignee_id uuid references auth.users,
                      visibility text not null default 'dept',   -- 인용된 소스 중 가장 좁은 visibility를 상속
                      status text not null default 'open',   -- open|decided|deferred|rejected|needs_review (인용 검증 2회 실패)
                      origin_item_id uuid references items,  -- 승격 원본. open 상태에서 같은 원본은 1건만
                      opened_at timestamptz default now(), closed_at timestamptz);
create unique index one_open_request_per_item on decision_requests (origin_item_id) where status = 'open';
create table decisions (id uuid primary key default gen_random_uuid(), dept_id uuid references departments not null,
                      request_id uuid references decision_requests unique,   -- 직접 기록이면 null. 카드 1장 = 결정 1건 (더블클릭·동시 결정 방지)
                      decided_by uuid references auth.users on delete set null,   -- 탈퇴해도 원장은 남는다
                      decided_by_name text not null,      -- 결정 당시 표시명 스냅샷 (원장은 조직 기록)
                      decided_at timestamptz default now(),
                      outcome text not null, rationale text not null,
                      supersedes_id uuid references decisions,   -- 정정: 새 행이 옛 행을 가리킨다. 삭제·수정 없음
                      lead_time_min int);                 -- opened_at → decided_at (파생값. 지표는 뷰 decision_metrics에서 계산)
create table citations (id uuid primary key default gen_random_uuid(),
                      owner_kind text not null, owner_id uuid not null,   -- decision_request|decision|answer
                      item_id uuid references items, decision_id uuid references decisions,
                      quote text not null);
create table conflicts (id uuid primary key default gen_random_uuid(), request_id uuid references decision_requests not null,
                      prior_decision_id uuid references decisions not null, explanation text not null, confirmed boolean);

-- Q&A와 감사
create table answers (id uuid primary key default gen_random_uuid(), dept_id uuid references departments not null,
                      asked_by uuid references auth.users on delete set null, question text not null, answer text,
                      status text not null default 'pending',   -- pending|done|refused|failed (failed는 error_code 필수)
                      error_code text,                          -- llm_timeout|llm_refusal|schema_invalid|citation_invalid|rate_limited
                      refused boolean default false, excluded_count int default 0,   -- 권한 밖 제외 건수 (감사 로그 전용)
                      verified boolean, generic_answer text, question_key text, created_at timestamptz default now());

-- 비동기 작업과 비용 (아키텍처 렌즈 반영)
create table jobs    (id uuid primary key default gen_random_uuid(), kind text not null,
                      -- classify|embed|embed_decision|summarize_meeting|make_card|answer|send_slack|notion_import|slack_backfill|sweep
                      payload jsonb not null, status text not null default 'queued',   -- queued|running|done|failed
                      attempts int default 0, run_after timestamptz default now(),
                      last_error text, created_at timestamptz default now(), updated_at timestamptz);
create index jobs_claim on jobs (run_after) where status = 'queued';
create table llm_calls (id uuid primary key default gen_random_uuid(), dept_id uuid, job_id uuid references jobs,
                      purpose text not null, model text not null,
                      input_tokens int, output_tokens int, cost_usd numeric, duration_ms int,
                      created_at timestamptz default now());   -- §4 비용 상한 $100을 측정할 유일한 근거
```

**RLS 원칙**
- 사용자가 읽는 테이블(departments·members·sources·items·classifications·meetings·decision_requests·decisions·answers)에는 `dept_id`. 정책: `dept_id in (select dept_id from members where user_id = auth.uid())`. `citations`·`conflicts`는 소유 객체(items·decisions·decision_requests) join으로 판정. `jobs`·`ingest_events`·`llm_calls`·`orgs`는 사용자 접근 없음(RLS로 전부 차단, service role만). **USING과 WITH CHECK 둘 다** 건다 — 읽기만 막고 쓰기를 열어두는 실수가 가장 흔하다.
- 가시성 판정은 SQL 함수 **`can_see(p_user uuid, p_dept uuid, p_visibility text)`** 하나에 둔다. RLS 정책도, 서버의 검색 함수도 이 함수를 호출한다. 판정 로직이 두 곳에 있으면 반드시 어긋난다.
- `sources.visibility = 'leads_only'`인 소스의 `items`·`citations`·그 소스를 인용한 `decision_requests`는 `role = 'lead'`만 select 가능. 이것이 "같은 질문, 다른 답"의 구현체.
- 게스트 모드는 `orgs.is_demo = true`인 부서만 anon read-only 정책. 쓰기 금지. 이름 문자열로 판별하지 않는다.
- Q&A 검색은 **질문자 권한으로** 실행한다. 웹은 사용자 세션 클라이언트, 슬랙 경유는 `search_as(p_user uuid, …)` SECURITY DEFINER 함수(내부에서 `can_see` 적용). service role로 검색한 뒤 애플리케이션에서 필터링하지 않는다(누락 시 유출).

### 6-2. WATCH — 수집·분류 파이프라인

```
Slack Events / 회의 전사 / Notion 폴링
  → 어댑터 (채널별 파서 → items 공통 스키마, 정규식 선마스킹)
  → 규칙 신호·마감 추출 → 모든 유효 항목을 gpt-oss-20b 정성 분류
  → classifications 저장 → 대시보드 폴링(10초)에 반영
  → label = decision 이면 DECIDE 파이프라인 트리거
```

- **슬랙**: `message.channels`·`message.groups` 이벤트, 지정 채널만. 스레드 답글은 부모와 묶는다. 편집 이벤트는 본문만 갱신(재분류 안 함 — §8-0), 삭제 이벤트는 `content`·`embedding` 삭제 + `deleted_at`(행과 인용 quote는 유지, "원문 삭제됨" 표시). 봇 자신의 메시지, 본문 없는 메시지(파일만·이모지만·조인 알림), **미동의 멤버의 메시지**(`author_ext_id`로 판별, 저장 자체를 안 함) 제외. `event_id`로 멱등 처리 — 슬랙은 3초 내 200이 없으면 같은 이벤트를 재전송한다.
- **회의**: 봇 전사 → 화자 라벨 + 타임스탬프 단위로 items 분할(발언 1건 = item 1건). 화자 라벨이 없으면 `author = '화자 미상'`. 전사 업로드 대체 경로는 .vtt/.txt 파서 — 파싱 실패 시 어느 줄에서 실패했는지 보여주고 재업로드. 회의 종료 후 gpt-oss-120b로 **회의 정리**(결정·보류 안건·액션) 1회 생성 — 90분 초과 회의는 30분 창으로 나눠 정리 후 병합. 이 산출물은 "입력 채널의 요약"일 뿐 제품의 본체가 아니다.
- **노션**: 지정 페이지·하위 블록을 items로 **1회 가져오기** + 세팅의 [다시 가져오기] 버튼. 자동 폴링·변경 감지는 나중(Phase 4). 부서 원칙 문서는 `sources.is_principles`로 표시해 방향 제안 시 우선 참조.
- **규칙 휴리스틱** (정량 신호는 규칙으로): 물음표 + 2인칭 요청("~할까요", "~해도 돼요", "확인 부탁"), 마감 표현("오늘까지", "금요일", 날짜), 회의 정리의 "보류" 태그, 12시간 이상 답글 없는 질문. 규칙은 보조 신호이며 모델 호출의 제외 조건이 아니다. 동의·마스킹된 유효 저장 항목은 모두 모델로 분류한다. 빈 본문·삭제 항목은 호출하지 않는다. 미결 선택/승인=decision, 확정 방향 실행=action, 완료 사실/현황=info, 비업무 대화=chatter. confidence=null은 기존 규칙 후보인 경우에만 자동 승격한다(ADR-034).
- **LLM 분류** (gpt-oss-20b, strict json_schema): `{label, confidence, deadline_hint, assignee_hint, reasoning}`. strict 모드는 모든 필드가 required이므로 `deadline_hint`·`assignee_hint`·`confidence`는 optional이 아니라 **nullable union**(`["string", "null"]`)으로 정의한다. confidence < 0.6은 대시보드에 "확인 필요"로 표시하고 카드로 자동 승격하지 않는다. LLM 호출 실패(타임아웃·429·스키마 불일치)는 지수 백오프 3회 후 `unclassified`로 저장 — 항목을 버리지 않고 대시보드 "분류 대기 N건"에 남긴다. `deadline_hint`는 `spoken_at` 기준 상대 표현("금요일까지")을 KST로 해석, 해석 불가면 null(카드에 "마감 미정").
- **마스킹 규칙**: 전화·이메일·주민번호·계좌·카드번호만. 금액·날짜·수량은 마스킹하지 않는다(견적 금액이 전화번호로 오인되면 결정 근거가 사라진다). 치환 토큰은 `[전화번호]`처럼 종류를 남긴다.

### 6-3. DECIDE — 결정 카드

1. 입력: 결정 후보 item + 같은 안건으로 묶인 items(임베딩 유사도 상위 5) + 부서 원칙 문서 + 원장 유사 결정 상위 3.
2. gpt-oss-120b strict json_schema: `{title, background, deadline, assignee_hint, recommendation, citations[{item_id|decision_id, quote}], conflicts[{decision_id, explanation}]}`. null이 정상인 필드(`deadline`·`assignee_hint`)는 nullable union으로 둔다 — strict는 optional을 허용하지 않는다.
   - **필드 순서**: citations → background → recommendation. 근거를 먼저 쓰고 결론을 나중에 쓰게 유도한다. 단 json_schema의 properties 순서는 생성 순서를 **보장하지 않으므로**, 시스템 프롬프트에도 같은 순서를 명시하고 최종 방어선은 인용 문자열 검증(6-3 ②·ADR-013)이다.
   - citations 최소 1개 required. 파이프라인에서 `item_id` 실존 + `quote`가 원문에 포함되는지 검증. 실패 시 1회 재생성, 재실패 시 카드를 "검토 필요" 상태로 대시보드에만 두고 DM은 보내지 않는다.
3. 담당자 결정: `assignee_hint`가 멤버와 매칭되면 그 사람, 아니면 부서 결정권자(lead). **단, 카드의 `visibility`가 `leads_only`(인용 소스 중 하나라도 leads_only)이면 담당자는 lead로 강제한다** — 경영회의 내용이 담긴 카드가 팀원 DM으로 가면 안 된다.
4. 발송: 웹 카드 생성 + 슬랙 DM (Block Kit: 헤더·마감·배경·근거 링크·충돌 경고·[결정][보류][반려] 버튼). 버튼 → 모달로 사유 입력. DM은 담당자 1인에게만. 버튼 클릭 시 서버가 **클릭한 Slack 사용자 = 담당자 또는 lead**인지 검증한다.
5. 결정 시: `decisions` insert, `decision_requests.status` 갱신, 리드타임 계산, 원 스레드에 **결과 한 줄 + 원장 링크만** 공지("결정됨: 재입찰 검토 → 원장 #57"), 질문자 멘션. 사유·배경·인용은 스레드에 쓰지 않는다 — 스레드는 채널 전원이 보고, 카드에는 leads_only 근거가 섞일 수 있다.
6. **동일 안건 병합**: 새 후보가 최근 72시간 내 open 카드와 유사도 0.55 이상이면 후보로 두고, gpt-oss-20b에 "같은 미결 결정인가"를 1회 확인해 참일 때만 새 카드를 만들지 않고 기존 카드에 근거를 추가한다 (슬랙 질문 + 회의 보류가 같은 카드가 되는 장면). 확인 호출이 실패하면 병합하지 않는다 (ADR-037 — 임베딩 단독 0.85는 실측상 병합이 일어나지 않고, 낮추면 같은 대상의 다른 결정이 섞인다). lead의 근거 제거 UI는 나중(Phase 4) — 오병합은 lead가 카드를 반려하고 원본을 다시 승격한다. **병합은 카드의 visibility를 좁히지 않는다** — 새 후보의 소스가 기존 카드보다 좁으면(leads_only → 이미 member에게 DM된 dept 카드) 병합하지 않고 별도 카드를 만든다. 파생값이 원본보다 늦게 바뀌는 드리프트를 원천 차단.
7. **발송 실패 처리**: 담당자가 미동의(`consented_at` null)이거나 봇이 DM을 열 수 없으면 웹 카드만 만들고 lead에게 "DM 발송 불가: 사유"를 알린다. 슬랙 `chat.postMessage` 429는 1초 대기 후 재시도 3회.
8. **보류와 마감 경과**: [보류]는 상태만 바꾼다(`deferred`). 마감이 지난 open·deferred 카드는 대시보드와 원장에 "마감 지남" 배지로 보인다. 재알림 날짜·리마인드 DM은 나중(Phase 4) — 12일 안에 검증할 수 없는 기능이다.
9. **결정 멱등성**: 결정 버튼·모달 제출은 `decisions.request_id unique`로 1건만 허용. 두 번째 시도(더블클릭·동시 결정·슬랙 재전송)는 "이미 {이름}이(가) {시각}에 결정했습니다 → 원장 #N"으로 응답한다. 승격 버튼도 `one_open_request_per_item`으로 같은 원본의 open 카드는 1장.

### 6-4. LEDGER — 결정 원장과 충돌 감지

- 원장 항목 = `decisions` + `citations`. 목록은 최신순, 필터(상태·담당자·기간).
- **직접 기록**: 웹에서 결과·사유·근거(선택) 입력. 근거 없는 직접 기록도 허용하되 "근거 없음" 배지.
- **충돌 감지**: 카드 생성 시(6-3) 원장 유사 결정 상위 3을 gpt-oss-120b에 함께 주고 `conflicts[]`를 받는다. 배지는 카드와 원장의 해당 결정 양쪽에. 결정 후 재검사와 `confirmed` 표시 UI는 나중(Phase 4).
- 원장 상세에서 근거 클릭 → 원문(슬랙 permalink / 회의 전사 구간 / 노션 블록)으로 이동.

### 6-5. ASK — 권한 인지 Q&A

1. 질문 수신 (웹 S4 또는 슬랙 `@사수` 멘션·DM).
2. **질문자 권한으로** pgvector 검색: items 상위 8 + decisions 상위 3 + 원칙 문서 청크 상위 3. "N건 제외"는 질문자에게 보여주지 않는다 — 숨긴 정보의 존재가 드러난다(기획서 §05). `excluded_count` 산출(service role 2차 검색)은 감사 로그 뷰와 함께 나중(Phase 4)으로 — 요청 경로에서 service role을 아예 쓰지 않게 되어 보안도 단순해진다.
   - **답변이 게시되는 곳의 권한이 질문자 권한보다 우선한다.** 슬랙 채널에서 `@사수`로 물으면 lead가 물었더라도 **member 권한**으로 검색한다(답이 채널 전원에게 보이므로). lead 권한 답변은 웹 S4 또는 슬랙 DM에서만.
   - 슬랙 사용자 매핑이 없는 사람(`members.slack_user_id` null)의 질문은 답하지 않고 "세팅에서 계정 연결이 필요합니다"로 응답.
3. gpt-oss-120b strict json_schema: `{citations[], answer, refused, refusal_reason}`. 순서는 citations → answer. 시스템 프롬프트: "제공된 근거에 없는 내용은 답하지 않는다. 근거가 부족하면 refused=true."
4. 인용 검증: `quote`가 원문에 포함되는지 문자열 검증(1차)만. 실패한 인용은 제거하고 인용이 0개가 되면 refused 처리. LLM 심판(2차)은 나중(Phase 4).
5. 응답: 답변 + 인용 카드(발언자·시각·출처 링크) + 고정 문구 "내 권한 범위 안의 부서 기록만 참고했습니다"(N과 무관하게 항상 표시). refused면 "이 질문에 답할 근거가 부서 기록에 없습니다. 결정권자에게 카드로 보낼까요?" → 승락 시 6-3으로 승격.
6. `answers`에 전량 기록 (감사 로그).
7. **실행 모델**: 질문 → `answers` row(pending) 즉시 생성 → 백그라운드 처리 → UI는 2초 폴링. 슬랙은 먼저 "찾아보는 중…" 메시지를 보내고 완료 시 갱신. 2분 넘게 pending이면 스윕 잡이 `failed(llm_timeout)`으로 바꾼다 — 사용자에게 영원히 도는 스피너를 보여주지 않는다.
8. **입력 검증**: 빈 질문·5자 미만은 전송 전에 막는다. 1,000자 초과는 잘라서 보낸다고 알린다. 인덱스가 비어 있으면(items 0건) LLM을 부르지 않고 "아직 참고할 기록이 없습니다 — 채널을 연결하거나 회의 전사를 올려주세요"로 답한다.

### 6-6. 부서 세팅

- 부서 템플릿은 `general` **1종**. 게스트 샘플(영업팀)도 같은 템플릿에 데이터만 영업 맥락. 템플릿별 규칙 가중치는 나중(Phase 4).
- 슬랙: **MVP는 단일 워크스페이스** — 앱은 우리 워크스페이스에 수동 설치하고 봇 토큰은 환경 변수. S5에서는 `conversations.list`로 채널 선택(퍼블릭·봇 초대된 프라이빗)만 한다. OAuth "Add to Slack" 설치 흐름은 나중(§8-1).
- **동의가 수집보다 먼저다 (체크리스트 0단계)**: lead가 멤버 목록에 동의 요청을 보내면(봇 DM [동의합니다] 버튼 또는 웹 S0), 각자의 `consented_at`이 기록된다. 채널 연결은 **그 채널 멤버 전원이 동의한 뒤에만** 가능하다. 연결 시 봇이 채널에 "사수가 이 채널을 수집합니다(최근 7일 포함)" 공지를 게시한다. RLS는 접근 통제이지 수집의 법적 근거가 아니다 — 근거는 동의다.
- 미동의 멤버(나중에 합류한 사람 포함)의 발언은 **저장하지 않는다**(어댑터가 `author_ext_id`로 skip). 이름만 가리고 본문을 저장하는 방식은 쓰지 않는다. 미동의 멤버는 카드 DM 대상에서도 제외.
- 채널 제거 시 해당 items의 `content`·`embedding` 삭제 + `deleted_at`. 행과 `citations.quote`는 원장 근거로 남는다 — 동의문에 명시 (6-12와 동일 정책).
- **연결 시 백필**: 채널을 연결하면 `conversations.history`로 최근 **7일**을 가져와 같은 파이프라인에 넣는다(job 1개, 페이지네이션). 빈 대시보드로 시작하지 않고, 개발 중 분류를 실데이터로 테스트하기 위해서다. 백필 범위는 공지 메시지에 명시("최근 7일 메시지를 포함합니다").
- 회의: 봇 참석 설정(캘린더 링크 또는 회의 URL 수동 입력) 또는 전사 파일 업로드. 봇 참석 시 채팅창에 참석 고지 메시지.
- 노션: 통합 토큰으로 공유된 페이지 중 원칙 문서 지정.
- 결정권자: 멤버 목록에서 `lead` 지정. 동의 상태는 멤버 목록에 표시.

### 6-7. 게스트 모드

- `scripts/seed-demo.ts`: 가상 회사 "온새미로 주식회사"의 **부서 2개(영업팀·개발팀)** 3주치 슬랙·회의 전사·노션 원칙 문서를 **합성 데이터**로 생성 → 실제 파이프라인을 돌려 분류·카드·원장·충돌을 만든다 → 결과를 DB에 시드. 모조 UI가 아니라 **실제 실행 결과의 스냅샷**. 합성 데이터의 **텍스트 콘텐츠는 D3~D5에 파이프라인과 병행해 미리 작성**하고, D10에는 시드 실행과 검증만 한다.
- **부서 2개인 이유**: 핵심 차별점 "부서 단위 격리"를 데모에서 보여줄 유일한 방법이다. 준비된 질문 6개 중 1개("단가 정책 어떻게 잡죠?")는 영업 사수와 개발 사수에게 같은 질문을 던져 **서로 다른 부서 원칙을 인용한 다른 답**을 나란히 보여준다. 구현 비용은 데이터뿐이다(격리는 `dept_id` + RLS로 이미 성립).
- 우리 팀 실데이터는 게스트 모드에 절대 노출하지 않는다(개인정보·기밀 유의사항).
- Q&A: 미리 정한 질문 6개의 사전 실행 응답 세트(팀장 시점 3 + 팀원 시점 3). 자유 입력은 "게스트 모드에서는 준비된 질문만" 안내. 심사 기간 API 비용·장애 차단.
- **범용 AI의 답 나란히**(장면 4): 시드 시점에 같은 질문 6개를 **검색·부서 맥락 없이** gpt-oss-120b에 던진 답을 `generic_answer`로 함께 저장한다. 별도 서비스·UI 호출 없이 시드 1회 비용뿐이다. 비교 기준은 하나 — "우리 부서의 원칙·결정을 인용했는가".
- 라우트 `revalidate` 캐시로 투표 트래픽 대비.

### 6-8. API 엔드포인트 (Next.js Route Handlers)

| 메서드·경로 | 동작 |
|---|---|
| `POST /api/slack/events` | 이벤트 수신 → 즉시 200 → 비동기 어댑터 |
| `POST /api/slack/interactions` | 카드 버튼·모달 → decisions 기록 |
| `POST /api/meetings/transcript` | 전사 파일 업로드 또는 봇 웹훅 수신 |
| `POST /api/notion/import` | 원칙 문서 가져오기 (세팅의 [다시 가져오기]) |
| `POST /api/jobs/run` | 워커 (after() + Vercel Cron 매분). 2분 스윕 포함 |
| `POST /api/consent` | 웹 동의 기록 (슬랙 버튼은 interactions로) |
| `GET /api/d/[dept]/items?label=` | 대시보드 |
| `POST /api/d/[dept]/cards` · `POST /api/cards/[id]/decide` | 카드 생성(수동 승격)·결정 |
| `GET /api/d/[dept]/ledger` · `POST /api/d/[dept]/decisions` | 원장·직접 기록 |
| `POST /api/d/[dept]/ask` | Q&A |
| `POST /api/d/[dept]/voice` | 음성 파일을 메모리에서 한국어 전사. 원본 음성 저장 없음 |
| `GET/POST /api/d/[dept]/documents` | 문서 목록·업로드 및 정리 job 시작 |
| `GET /api/demo/*` | 게스트 스냅샷 (캐시) |

### 6-9. 권한 모델 (보안·권한 렌즈 반영)

**역할표 — 화면에서 버튼을 숨기는 것은 권한이 아니다. 아래 표는 서버·RLS에서 집행한다.**

| 역할 | 볼 수 있는 것 | 할 수 있는 것 | 못 하는 것 |
|---|---|---|---|
| **anon (게스트)** | `is_demo` 부서의 S1~S4 스냅샷, 사전 실행 Q&A 6건 | 없음 (읽기 전용) | 자유 질문, 모든 쓰기, 실제 부서 라우트 접근 |
| **member** | 자기 부서의 `visibility = dept` 소스·items·카드·원장·원칙 문서. 자기 질문의 답변 이력 | 질문(웹·슬랙 DM·채널), 카드 수동 승격 요청, 직접 결정 기록, 자기에게 배정된 카드 결정 | leads_only 소스·카드 열람, 세팅 변경, 감사 로그, 남의 카드 결정 |
| **lead** | member + `leads_only` 소스·카드, 동의 상태, LLM 사용액 (감사 로그 화면은 나중 — DB에는 기록) | member + 채널 추가·제거, 소스 visibility 지정, 결정권자 지정, 전사 업로드, 모든 카드 결정 | 다른 부서 접근 (MVP는 부서 1개라 경로 자체가 없음) |
| **service role (서버 내부)** | 전부 | 수집 어댑터 insert, 게스트 시드, `excluded_count` 계산 | 사용자 요청 경로에서 검색·조회에 사용 |

**가시성 규칙**
- 소스 visibility는 lead가 세팅에서 지정한다. **프라이빗 슬랙 채널의 기본값은 `leads_only`**, 퍼블릭 채널은 `dept`. 노션 페이지는 기본 `dept`. **MVP는 슬랙·노션의 원본 권한을 자동 상속하지 않는다** (기획서 §05의 "원본 권한 상속"은 로드맵 — §8-1에 추가).
- 파생물은 원본 중 가장 좁은 visibility를 상속한다: 카드(인용 소스), 회의 정리(회의 소스), 충돌 설명(양쪽 결정).
- 게시 위치가 질문자보다 우선한다: 채널 답변 = member 권한, DM·웹 = 질문자 권한.

**신원 매핑**
- 슬랙 사용자 ↔ auth 사용자는 세팅 시 **이메일 일치**로 매핑(`users:read.email` 스코프). 매핑 없는 슬랙 사용자는 질문·버튼 모두 거절.
- 회원가입은 열어두되, 부서 멤버십은 시드·lead 지정으로만 생긴다. 멤버십 없는 로그인 사용자는 "초대가 필요합니다" 화면.

**비밀값 흐름**
- 모든 키는 Vercel 환경 변수 → 서버 코드만. `NEXT_PUBLIC_` 접두사는 Supabase URL·anon key 두 개뿐.
- 슬랙 `/api/slack/events`·`/api/slack/interactions`는 **signing secret 검증** 후에만 처리. 봇 웹훅(`/api/meetings/transcript`)은 URL 시크릿 토큰 + 서명 검증 `(확인 필요: Recall.ai 웹훅 서명 지원)`. 전사 파일 업로드는 lead만, 10MB 상한.
- 슬랙 앱 스코프는 최소로 **10개**: `channels:history`, `groups:history`, `app_mentions:read`, `im:history`, `im:write`, `chat:write`, `users:read`, `users:read.email`, `channels:read`, `groups:read`. 뒤의 두 개는 채널 목록·멤버 조회(`conversations.list`·`conversations.members`)에 필요하다 — 세팅 화면의 채널 연결과 전원 동의 확인이 이것 없이는 성립하지 않는다 (ADR-031). 파일·이메일 본문 스코프는 요청하지 않는다.

**클라이언트를 믿지 않는 곳**
- `dept_id`·`decided_by`·`asked_by`는 요청 본문이 아니라 **세션과 멤버십에서** 결정한다. URL의 `[dept]`는 멤버십 검증 후에만 유효.
- 카드 결정·승격·직접 기록은 서버에서 역할표를 재검증한다(RLS WITH CHECK가 2차 방어).
- `/api/d/[dept]/ask`는 사용자당 **하루 50회** 상한(비용·남용). 게스트 라우트는 LLM 호출이 없다.

**로그에 남으면 안 되는 것**
- Vercel 함수 로그에 슬랙 이벤트 본문·전사 원문·질문 원문을 출력하지 않는다(에러 시에도 ID·길이·에러 코드만).
- `items.content`는 정규식 마스킹 후 저장. 마스킹 전 원문은 어디에도 저장하지 않는다.
- LLM에 보내는 프롬프트에는 마스킹된 본문만. Groq API 데이터 보존·학습 미사용 정책 `(확인 필요: 보존 기간·학습 미사용 여부)` — 제출서 문구에 반영.
- 감사 로그에 남는 것은 **질문·인용 ID·excluded_count**이며, 멤버에게 "lead가 질문 이력을 볼 수 있다"를 동의 화면에 명시한다.

### 6-10. 엣지 케이스·에러 핸들링 (엣지 케이스 렌즈 반영)

**원칙** — 하위 계층의 실제 에러를 뭉뚱그리지 않는다. 사용자에게는 **무엇이 실패했는지 + 다음에 할 수 있는 것**을 보여주고, 내부에는 `error_code`를 남긴다. "오류가 발생했습니다"만 있는 화면은 만들지 않는다.

**외부 서비스가 느릴 때·죽었을 때·절반만 응답할 때**

| 의존성 | 장애 시 거동 | 사용자가 보는 것 | 다음 행동 |
|---|---|---|---|
| Groq API (429·5xx·타임아웃) | 백오프 3회 → 분류는 `unclassified`, 카드는 `needs_review`, 답변은 `failed` | 대시보드 "분류 대기 N건" · 답변 "시간 초과로 답을 만들지 못했습니다" | [다시 시도] · [결정권자에게 카드로 보내기] |
| LLM 거절 (안전 필터·주제 거부) | 1회 재시도 후 `failed(llm_refusal)`. gpt-oss에는 `stop_reason: refusal`이 없으므로, 스키마의 `refused=true` 또는 인용 0개를 거절 신호로 판정한다 | "이 내용은 사수가 다룰 수 없습니다" | 질문 수정 |
| structured output 스키마 불일치 | 1회 재생성 후 `failed(schema_invalid)` | 위와 같은 실패 화면 | [다시 시도] |
| Slack API (postMessage 429·DM 불가) | 재시도 3회 → 웹 카드만 생성, lead 알림 | 카드에 "슬랙 DM 미발송: 사유" 배지 | 웹에서 결정 |
| Slack Events 수신 중단 (앱 비활성·토큰 만료) | 세팅 화면에 마지막 수신 시각 | "마지막 슬랙 수신 3시간 전 — 앱 재설치 필요" | 재연결 링크 |
| Notion API 실패 | 이전 인덱스 유지 | 세팅 "마지막 동기화 실패 (HTTP 502, 09:05)" | [지금 동기화] |
| Recall.ai 봇 입장 실패 (대기실·잠금·링크 오류) | 회의 status `bot_failed` + 사유 | "봇 입장 실패: 대기실 승인 필요" | [전사 파일 업로드] 대체 경로 |
| 임베딩 API 실패 | `embed_status = failed`, 재시도 큐 5분 간격 | 없음 (검색에서만 빠짐) · 세팅에 "임베딩 대기 N건" | 자동 |
| Supabase 다운 | 전 기능 불가 | 상단 배너 "저장소 연결 실패" | 재시도 |

**입력이 비었을 때 / 너무 클 때 / 형식이 틀렸을 때**

| 입력 | 처리 |
|---|---|
| 본문 없는 슬랙 메시지 (파일만·이모지만·조인/봇 알림) | 수집 제외 |
| 슬랙 메시지 4,000자 초과 | 저장은 전체, 분류·임베딩은 앞 4,000자 |
| 전사 파일 형식 오류 | "23번째 줄에서 타임스탬프를 읽지 못했습니다" + 재업로드. 10MB 초과 거부 |
| 화자 라벨 없는 전사 | `author = '화자 미상'`, 원장 책임자 표시에 "발언자 확인 필요" |
| 90분 초과 회의 | 30분 창 분할 정리 후 병합 |
| 노션 페이지 100블록 초과 | 헤딩 단위 청크, 청크별 임베딩 |
| 질문 5자 미만·1,000자 초과 | 전송 전 차단 / 잘림 안내 |
| 마감 표현 해석 불가 | `deadline = null`, 카드 "마감 미정", lead가 직접 입력 |
| 담당자 추정 불가 | lead에게 배정 |

**동시에 두 번 눌렀을 때 / 중간에 끊겼을 때**

- 결정·승격은 DB 유니크 제약으로 1건만 (6-3 ⑨). 두 번째는 "이미 결정됨" 안내.
- 슬랙 이벤트·인터랙션 재전송은 `ingest_events.event_id`로 멱등.
- 긴 작업(회의 정리·답변·카드 생성)은 모두 **row 먼저 만들고 백그라운드** + 폴링. 함수가 죽으면 2분 스윕이 `failed(llm_timeout)`으로 정리. 재시도는 같은 row를 다시 pending으로.
- 전사 업로드 중 끊김: 업로드 완료 후에만 파싱 시작. 부분 파일은 저장하지 않음.
- 편집된 슬랙 메시지: 재분류하되 이미 카드가 된 것은 카드에 "원문 수정됨" 표시(자동 재생성 안 함).

**빈 상태(empty state)**

| 화면 | 비어 있을 때 |
|---|---|
| S1 대시보드 | "수집 채널 N개에서 첫 메시지를 기다리는 중" + [세팅으로] · 채널 0개면 "슬랙 채널을 연결하면 시작됩니다" |
| S2 카드 목록 | "지금 결정할 것이 없습니다" (좋은 상태로 표현) |
| S3 원장 | "첫 결정을 직접 기록해보세요" + [직접 기록] |
| S4 묻기 | 인덱스 0건이면 입력창 위에 "아직 참고할 기록이 없습니다" (LLM 호출 안 함) |
| S5 세팅 | 온보딩 체크리스트 4단계(멤버 동의·채널·회의·원칙 문서) 진행률. 동의 0명이면 채널 연결 버튼 비활성 + "먼저 멤버 동의를 받아주세요" |

### 6-11. 아키텍처 (아키텍처 렌즈 반영)

```mermaid
flowchart LR
  subgraph IN[입력 — 외부 이벤트]
    SL[Slack Events / Interactions]
    RC[Recall.ai 웹훅 · 전사 업로드]
    NT[Notion 폴링]
  end
  subgraph API[Next.js Route Handlers — 3초 안에 끝내는 것만]
    ADP[어댑터: 서명 검증 → 마스킹 → items upsert → jobs enqueue]
    UI[대시보드·카드·원장·묻기 API — RLS 클라이언트]
  end
  subgraph W[워커 — /api/jobs/run, after() + Cron 매분]
    CL[classify] --> EM[embed]
    CL --> MC[make_card] --> SS[send_slack]
    SM[summarize_meeting] --> MC
    AN[answer]
    SW[sweep: 2분 초과 pending 정리]
  end
  subgraph DB[(Supabase Postgres)]
    IT[items · classifications]
    CD[decision_requests · decisions · citations · conflicts]
    JB[jobs · llm_calls]
    MT[meetings · sources · members]
  end
  LLM[llm.ts — Groq gpt-oss-120b / gpt-oss-20b 게이트웨이]
  SL --> ADP --> IT
  RC --> ADP
  NT --> ADP
  ADP --> JB
  JB --> W
  W --> LLM
  W --> IT
  W --> CD
  W --> MT
  UI --> CD
  UI --> IT
  UI --> JB
  SS --> SL
```

**데이터가 생기고 저장되고 조회되는 길**

| 데이터 | 생김 | 저장 | 조회 |
|---|---|---|---|
| 발언·메시지·문서 블록 | 어댑터 (마스킹 후) | `items` | 대시보드(RLS) · 검색(`search_as`) · 인용 원문 |
| 분류 | `classify` job | `classifications` | 대시보드 탭 |
| 회의 정리 | `summarize_meeting` job | `meetings.summary` (item_id 인용) | S1 회의 탭 · 카드 생성 입력 |
| 결정 카드 | `make_card` job (자동) 또는 UI 승격 | `decision_requests` + `citations` + `conflicts` | 웹 카드 · 슬랙 DM (`send_slack` job) |
| 결정 | 슬랙 인터랙션 또는 웹 | `decisions` (+ `lead_time_min`) | 원장 · 충돌 감지 입력 · Q&A 근거 |
| 답변 | `answer` job | `answers` | S4 폴링 · 감사 로그 |
| 비용 | `llm.ts`가 매 호출 기록 | `llm_calls` | 세팅 화면 "이번 달 사용액" · 파일럿 지표 |

**컴포넌트 경계와 계약 (TypeScript 타입으로 `lib/contracts.ts`에 고정)**
- `IngestItem` — 모든 어댑터의 출력. `{source_id, external_ref, author, spoken_at, content}`. 어댑터는 이것만 만들고 분류·LLM을 모른다.
- `Classification`, `CardDraft`, `AnswerDraft` — LLM structured output 스키마. Zod로 정의해 `llm.ts`의 `parse()`와 DB insert가 같은 타입을 쓴다.
- `llm.ts` — 유일한 Groq 호출 지점. 텍스트는 `llm.structured(purpose, schema, prompt)`, 음성은 `llm.transcribeAudio()`만 호출한다. 재시도·거절 처리·`llm_calls` 기록·마스킹 확인을 여기서만 한다.
- `jobs.ts` — `enqueue(kind, payload, {dedupeKey?})`와 `runOnce()`. `FOR UPDATE SKIP LOCKED`로 job을 집고, 실패는 `attempts`·지수 백오프로 `run_after` 갱신, 3회 실패 시 `failed` + 소유 row의 status 갱신(6-10의 `unclassified`/`needs_review`/`failed`가 여기서 나온다).
- `search.ts` — `search_as(user_id, dept_id, query_embedding, k)` SQL 함수 호출만. 권한 판정은 SQL 안(`can_see`).

**비동기 실행 모델 — 서버리스에서 성립하는 방식**
- 요청 핸들러는 (1) 검증 (2) DB 쓰기 (3) `enqueue` (4) `after(() => runOnce())` (5) 응답. 슬랙 3초 규칙과 Vercel 함수 수명 안에서 끝난다.
- 매분 트리거(Vercel Cron 또는 Supabase `pg_cron`→`pg_net` HTTP 호출, D0 확정)가 `/api/jobs/run`의 `runOnce()`를 돌려 `after()`가 죽었거나 재시도 대기 중인 job을 집는다. 2분 스윕(6-10)도 같은 워커의 `sweep` kind. 트리거 호출은 시크릿 헤더로 인증.
- 이 구조 하나로 재시도·멱등·스윕·비용 기록이 한 곳에 모인다. Supabase Edge Function은 쓰지 않는다(두 런타임을 1인이 관리하지 않는다).

**외부 의존성이 죽었을 때** — 6-10 표 참조. 아키텍처 관점의 원칙 하나: 어댑터는 외부 장애와 무관하게 **items를 먼저 저장**한다. LLM·임베딩·슬랙 발송은 전부 job이라 나중에 따라잡는다. 죽어서 데이터를 잃는 지점은 어댑터의 upsert 이전뿐이다.

**지금 규모와 10배 규모 — 대비하지 않고 어디서 깨지는지만 적는다**

| 결정 | 지금 (부서 1, 채널 3, 하루 ~200건) | 10배에서 깨지는 곳 |
|---|---|---|
| 슬랙 봇 토큰 1개 env | 충분 | 워크스페이스 2개째부터 OAuth + 토큰 테이블 필요 (§8-1) |
| 워커 단일 레인 매분 | 하루 200 job, 여유 | 부서 10개면 분당 처리량 한계 → 워커 병렬화 또는 큐 서비스 |
| pgvector 순차 스캔 (인덱스 없음) | 5만 건 이하 ms 단위 | 50만 건부터 HNSW 인덱스 필요 (인덱스 추가만으로 해결) |
| Notion 원칙 문서 수동 가져오기 | 페이지 몇 개 | 문서가 수십 개·자주 바뀌면 폴링 또는 웹훅 (8-0 "나중") |
| RLS 함수 `can_see` 행별 호출 | 무시 가능 | 대량 조회에서 느려지면 visibility를 items에 비정규화 |

**리포지토리 구조** → [ARCHITECTURE.md §2](ARCHITECTURE.md)가 원천이다 (`src/` 없이 `app/`·`components/`·`lib/`·`supabase/`·`tests/`·`phases/`). 패턴·불변식·테스트 경계는 같은 문서 §3·§6·§8.

### 6-12. 데이터·상태 (데이터·상태 렌즈 반영)

**상태 전이 — 이 표 밖의 전이는 서버가 거부한다**

| 객체 | 전이 | 누가 |
|---|---|---|
| 결정 카드 | `open → decided` / `open → deferred` / `open → rejected` / `deferred → open`(lead 재개) / `rejected → open`(재개) / `needs_review → open`(lead 검토 후) / `needs_review → rejected` | 담당자·lead / lead |
| 결정 | 생성만. 정정은 `supersedes_id`로 새 행. 삭제·수정 없음 | 원 결정자 또는 lead |
| 회의 | `scheduled → bot_joined → transcribed → summarized` / `scheduled → bot_failed`(→ 업로드로 `transcribed`) / `transcribed → summary_failed`(재시도 가능) | 자동 / lead |
| job | `queued → running → done` / `running → queued`(재시도, run_after 갱신) / `→ failed`(3회) | 워커 |
| 동의 | `null → consented_at` / 동의문 개정 시 `consent_version` 불일치면 재동의 요청 / 철회는 `consented_at = null` + 이후 발언은 저장하지 않음·DM 제외(과거 저장분은 유지 — 동의문 명시) | 본인 |

**지워야 하는 것과 남겨야 하는 것**

| 사건 | 지움 | 남김 | 근거 |
|---|---|---|---|
| 채널 제거 | `items.content`·`embedding` (하드), 분류 | `citations.quote`, 원장 | 원장에 인용된 발언은 결정의 일부. **동의문에 명시**: "원장에 인용된 발언은 원장의 일부로 남습니다" |
| 멤버 탈퇴(계정 삭제) | `auth.users`, `members` (cascade) | 원장의 `decided_by_name`, `items.author` 스냅샷, 감사 로그(asked_by null) | 원장은 조직의 업무 기록. 퇴사자 이름 보존의 법적 근거 `(확인 필요: 개인정보보호법상 업무 기록 보존 조항)` |
| 파일럿 종료 (지인 회사) | 조직 단위 전량 삭제 (`orgs` cascade) 요청 시 즉시 | 없음 | 파일럿 계약 조건 |
| 감사 로그 | 1년 후 삭제 | — | `미정`이었으나 기본값 1년으로 결정. 파일럿 기간엔 해당 없음 |
| Recall.ai 녹음·영상 | 전사 수신 즉시 삭제 요청 | 전사 텍스트만 우리 DB에 | §10 #13 |
| 게스트 데모 데이터 | 시드 스크립트가 데모 org를 truncate 후 재생성(멱등) | — | 재시드 안전 |

**같은 정보가 두 곳에 있는 곳 — 어느 쪽이 진실인지**

| 중복 | 진실 | 규칙 |
|---|---|---|
| `decision_requests.visibility` ↔ 인용 소스들의 visibility | 소스 | 카드 생성 시 계산, 이후 좁아지는 변경 금지(6-3 ⑥). 소스 visibility를 lead가 나중에 좁히면 해당 카드도 재계산 + 이미 DM된 경우 lead 알림 |
| `decisions.lead_time_min` ↔ `opened_at`/`decided_at` | 타임스탬프 | 파생값. 지표 화면은 뷰 `decision_metrics`에서 계산, 컬럼은 표시 편의용 |
| `items.author` ↔ 슬랙 현재 표시명 | 당시 스냅샷 | 의도된 스냅샷. 이름 변경을 소급하지 않는다 |
| `classifications.label = decision` ↔ 카드 존재 | 각자 | 재분류는 카드를 건드리지 않는다. 카드는 자기 생명주기(위 전이표) |
| `decided_by` ↔ `decided_by_name` | FK가 살아 있으면 members, 아니면 스냅샷 | 렌더 규칙 하나로 통일 |
| 슬랙 스레드의 "결정됨" 공지 ↔ 원장 | 원장 | 정정 시 스레드에 "정정됨 → 원장 #M" 추가 게시, 원 공지는 수정하지 않음 |

**되돌리기가 필요한 작업**

- 결정 정정: 새 결정 행 + `supersedes_id` + 사유 필수. 원 행에 "정정됨" 배지. 원장 목록은 최신 행만 기본 표시, 이력 펼침.
- 카드 오반려·오보류: lead가 `open`으로 재개.
- 채널 오제거: 재연결 시 백필 7일로 복구(그 이전 분은 복구 불가 — 제거 확인 모달에 명시).
- 오병합: lead가 근거 제거 (6-3 ⑥).
- 동의 철회: 이후 수집분부터 적용, 과거 스냅샷 유지.

**나중에 마이그레이션을 부를 결정 (알고 감수한다)**
- `citations.owner_kind/owner_id` 다형 참조 — FK 무결성이 없다. 3종(카드·결정·답변)이 늘어나면 테이블 분리.
- `embedding vector(1024)` 고정 차원 — 모델 교체 시 컬럼 재생성 + 전량 재임베딩. `embed_model`로 혼재만 막는다.
- `sources.visibility` 2단계(dept/leads_only) — 부서 간 교차·개인 범위가 생기면 ACL 테이블로 승격.
- 부서 1개 전제의 URL·세션 구조 — 멀티 부서는 `members` 다중 행으로 데이터는 준비돼 있으나 UI의 부서 전환은 없음.

---

## 7. 디자인 가이드

`사수_기획서_v3.html`의 토큰을 그대로 제품에 쓴다. 심사 목록의 흰 바탕·보라 그라데이션 사이에서 한눈에 구분되는 색.

| 토큰 | 값 | 용도 |
|---|---|---|
| accent (소나무 녹) | `#17614A` / 다크 `#6CBFA2` | 브랜드, 버튼, 인용 표시 |
| urgent (호박) | `#B0611B` / 다크 `#DB9A55` | **"지금 결정" 전용**. 다른 곳에 쓰지 않는다 |
| bg / surface | `#F6F7F5` / `#FFFFFF` (다크 `#141816` / `#1C211E`) | |
| ink / muted | `#1F2823` / `#66716A` | |
| 서체 | 제목 Hahmlet · 본문 Gothic A1 · 메타 IBM Plex Mono | 폰트 로드 실패 시 시스템 고딕 |

**원칙**
- **인용이 곧 UI다.** 답변·카드·원장의 모든 주장 옆에 출처 칩(발언자 · 시각 · 채널). 칩이 없는 문장은 렌더하지 않는다.
- "지금 결정" 카드는 호박색 좌측 보더 + 마감 카운트다운. 나머지 분류는 무채색.
- 권한 밖 제외 표시는 회색 자물쇠 한 줄 — 경고가 아니라 신뢰의 언어로.
- 금지 서사: "감시", "대체", "평가". 카피는 "팀장을 회의실에서 구출하고, 팀원에게 물어볼 선배를 준다".
- 모바일: 슬랙 DM이 모바일 진입점이므로 웹은 데스크톱 우선, 카드 상세·Q&A만 모바일 대응.

---

## 8. 제약 사항

**ADR-035 재생성 상한:** 답변 인용 복구는 최초 생성 포함 최대 2회다(각 호출의 기존 게이트웨이 재시도는 별도). 추가 호출 비용을 기록한다. 이 검증은 문자열 인용 검증이며 의미적 함의나 워커 lease/외부 전송 exactly-once를 보장하지 않는다.

**ADR-034 비용 변경:** 분류 모델 호출은 기존 후보 수 K에서 유효 항목 수 N으로 늘어난다. `llm_calls` 및 고정 평가의 호출 수·토큰·지연을 전후 비교하고 기존 비용 상한은 유지한다. 전수 분류는 앞 4,000자 제한이나 모델 오류까지 해결했다는 뜻이 아니다. Lindy 테스트 계정이 없어 직접 비교는 미실행이며 사수 전후 비교로 대체한다.

**2026-09-12 범위 구분:** §3의 Lindy 흡수는 제품 목표다. 전체 기능군의 제출 전 포함 여부와 추가 일정은 아직 확정하지 않았으므로, 기존 9/20 제출 기한과 아래 MVP 컷 라인은 유지한다. 현재 구현·검증·확장 예정 항목을 구분해서 보고하며, 외부 연동 개통이나 실제 메일·일정 쓰기는 이 목표만으로 자동 승인하지 않는다.

### 8-0. Phase 4 삭감 결과 — 최종 MVP 범위

렌즈 5개가 얹은 것을 "1인 · 12일 · 데모 5장면"으로 다시 깎았다. **남은 것**과 **뺀 것**을 나란히 둔다. 뺀 것은 다음 사이클의 입력이다.

**남은 것 (이것이 MVP다)**

| 영역 | 범위 |
|---|---|
| 입력 | 슬랙 채널 상시 수신(+7일 백필) · 회의 봇 전사(D6까지, 실패 시 전사 업로드) · 노션 원칙 문서 1회 가져오기 |
| 처리 | 정규식 마스킹 · 규칙 + gpt-oss-20b 분류 · 임베딩 · 회의 정리(결정·보류만) · 카드 생성(인용 문자열 검증·충돌 감지·72h 유사도 병합) · 답변(권한 검색·인용 검증·refused) |
| 화면 | S0 동의 · S1 대시보드(분류 탭 + 회의 탭) · S2 카드(웹 + 슬랙 DM 버튼·모달) · S3 원장 · S4 묻기 · S5 세팅(체크리스트·채널·회의·노션·visibility·결정권자) · S6 게스트 |
| 기반 | Supabase RLS(`can_see`·`search_as`) · `jobs` 워커 · `llm.ts` 게이트웨이 · `llm_calls` · 슬랙 서명 검증 · ask 일일 상한 |
| 데이터 | 6-1 스키마 전체 (컬럼은 공짜라 `supersedes_id`·`consent_version`·`embed_model`·`author_ext_id` 유지) |

**뺀 것 (나중) — 렌즈가 추가했다가 Phase 4에서 제외**

| 항목 | 렌즈 | 왜 지금 아닌가 | 대체 |
|---|---|---|---|
| 인용 정합성 LLM 심판(2차) | 엣지 | 데모에서 차이가 안 보이고 LLM 호출·지연 추가 | 문자열 포함 검증 |
| `excluded_count` service role 2차 검색 + 감사 로그 뷰 | 보안 | 보여줄 화면이 없으면 계산도 무의미. 요청 경로의 service role 제거로 보안 단순화 | `answers` 기록만 |
| 보류 재알림 날짜·마감 리마인드 DM·`/api/cron/remind` | 플로우 | 12일 안에 한 번도 발동하지 않는다 | "마감 지남" 배지 |
| S4 내 질문 이력 | 플로우 | 데모 동선 밖 | 결정 시 질문자 슬랙 멘션 |
| 노션 5분 폴링·변경 감지·`sync_cursor` 활용 | 아키텍처 | 원칙 문서는 데모 기간 안 바뀐다 | 1회 가져오기 + [다시 가져오기] |
| 병합 LLM 확인·lead 근거 제거 UI | 엣지·데이터 | 데모 데이터는 통제 가능 | 반려 후 재승격 |
| 결정 후 충돌 재검사·`confirmed` UI | 데이터 | 카드 시점 감지로 장면 3 성립 | — |
| 결정 정정 UI | 데이터 | 스키마만 | 나중 |
| 부서 템플릿 2종 | 플로우 | 가중치 차이를 보여줄 장면 없음 | 1종 |
| 슬랙 편집 이벤트 재분류 | 엣지 | 드물고 카드에 영향 없음 | 본문만 갱신 |
| `decision_metrics` 뷰 | 데이터 | 지표 화면 없음 | insert 시 `lead_time_min` |
| 음성 업무 입력 | 사용자 요청 | 브라우저 녹음 → Groq Whisper 전사 → 사용자가 확인 후 ASK 실행 | 원본 음성 저장 없음 |

**남은 범위가 한 사람이 감당 가능한가** — 화면 8개(S0~S7), job 10종, 외부 연동 3개(슬랙·Recall·노션 1회) + Groq 음성 전사, 데모 장면 5. 문서 업로드와 음성 입력은 원본 저장 없이 기존 items/ASK 파이프라인을 재사용해 추가한다.

### 8-1. 이번에 만들지 않는 것 (나중)

| 항목 | 이유 | 대체 |
|---|---|---|
| 메일 채널 | 기획서 2순위 | 로드맵 |
| 음성 30초 등록 → 화자 지문 식별 | 생체정보 동의·식별 모델·오인식 대응이 별도 제품 범위 | 화자 라벨 전사 + 음성 업무 입력 |
| 오프라인 회의 폰 원탭 녹음·캘린더 알림 (v2.1 핵심이었음) | 온라인 봇·전사 업로드로 대체 | 로드맵 |
| 부서 간 교차 결정 (CROSS) | 부서 1개 슬라이스 | 로드맵 |
| 부서 템플릿 7종 | 2종만 | 로드맵 |
| Presidio 2차 마스킹 | 정규식 선마스킹만 | 로드맵 |
| 슬랙·노션 원본 권한 자동 상속 | lead가 소스별 visibility 수동 지정 | 로드맵 |
| 슬랙 OAuth "Add to Slack" 멀티 워크스페이스 설치 | 단일 워크스페이스 수동 설치, 토큰 env | 파일럿 2팀째는 별도 배포 인스턴스 |
| 캘린더 연동 자동 봇 참석 | 회의 URL 수동 입력 | 로드맵 |
| 공유 카드("이번 주 미룬 결정 N개") 자동 생성 | 투표 캠페인용 | 디자인 툴로 정적 카드 3종 |
| 인사평가 보조·개인 포트폴리오 | 감시 프레임 위험 | 발표에서 로드맵 한 줄만 |
| 결제·멀티 조직·초대 플로우 | 파일럿 2팀은 수동 시드 | 로드맵 |
| 실시간 스트리밍(SSE) | 폴링으로 충분 | 여유 시 |
| Lindy식 시간 트리거(주간 브리핑) | 이벤트 트리거만 | 로드맵 |

### 8-2. 컷 라인 (일정이 밀리면 이 순서로 버린다)

Phase 4에서 이미 뺀 것(8-0)은 여기 없다. 아래는 **최종 범위 안에서** 더 밀릴 때의 순서다.

**⓪ D3 세로 슬라이스 게이트 (9/10 목 자정)** — 외부 리뷰 두 곳의 공통 처방. "실제 슬랙 메시지 → 분류 → 카드 → 웹에서 결정 → 원장"이 **배포 URL에서** 돌지 않으면, 아래 컷 ①~④를 기다리지 않고 즉시 강등한다: 회의는 전사 업로드 전용(봇 시도 안 함), 노션은 원칙 문서 텍스트 붙여넣기(API 안 씀), 임베딩 검색은 키워드 검색으로. 판정은 감이 아니라 그날 밤 시크릿 창에서 5분 안에 완주되는지로 한다.

| 순위 | 기능 | 대체 | 판정 시점 |
|---|---|---|---|
| 1 | 채널 연결 7일 백필 | 연결 시점부터 수집. 개발 테스트는 우리 팀 실시간 메시지로 | D4 |
| 2 | **온라인 회의 봇** | Zoom/Meet 기본 전사 파일 업로드 | **D6 (9/13)** |
| 3 | 72h 유사도 병합 | 슬랙·회의가 각각 카드. 데모 장면 3은 "같은 형식의 카드 2장"으로 서사 조정 | D6 |
| 4 | S1 회의 탭 | 회의 정리를 카드 생성에만 쓰고 화면은 생략 | D8 |
| 5 | 슬랙 DM 카드 버튼·모달 | 웹 카드에서만 결정, DM은 링크만. **주의**: 이 컷은 2-4의 이탈 방지 원칙(DM 안에서 결정 완료)을 되돌린다 — 발동 시 데모 장면 3은 웹 카드로 촬영하고 매직링크 왕복 이탈을 감수 | D9 |
| 6 | S0 동의 화면 | 슬랙 공지 버튼만 | D9 |
| 7 | 소스별 visibility 지정 UI | 시드로 leads_only 소스 1개 고정 (데모 장면 4 유지) | D9 |

**D6 판정 기록 (2026-09-13, ADR-036)**
- **컷 ② 발동**: 판정일까지 Recall.ai 계정·API 키가 없고, 봇 전사가 items로 들어온 실행 증거가 0건이다. 회의 입력은 `.vtt/.txt` 전사 업로드로 확정한다. 봇 연동·`/api/meetings/transcript` 웹훅은 로드맵(§8-1)으로 내린다. 제출물 §5·§6·§7에서 봇을 "만든 것처럼" 쓰지 않는다.
- **병합 방식 변경 (ADR-037)**: Voyage 실측(24쌍)에서 같은 안건 0.58~0.78, 같은 대상·다른 결정 0.54~0.84로 분포가 겹쳐 임베딩 임계값만으로는 오병합 없이 병합할 수 없다. §6-3 ⑥을 "72h·유사도 0.55 이상 후보 → gpt-oss-20b 동일 안건 확인(`llm.structured`) → 확인된 경우만 병합"으로 바꾼다. §8-0의 "병합 LLM 확인은 나중"을 이 항목만큼 앞당긴다. 게이트: 같은 fixture에서 오병합 0건 · 같은 안건 7/10 이상.
- **컷 ③ 보류**: 72h 유사도 병합은 D6~D7 Codex step으로 구현을 시도한다. 9/14(D7) 자정까지 "슬랙 질문 1건 + 전사 보류 1건 → 카드 1장"(§11 DECIDE)이 로컬 테스트에서 성립하지 않으면 컷 ③을 발동하고 데모 장면 3을 "같은 형식의 카드 2장"으로 조정한다.

**절대 안 버리는 것**: 결정 카드 · 결정 원장 · 권한별 답변 차이 · 근거 인용 · 게스트 모드. 이 다섯이 빠지면 Otter·Lindy와 다를 게 없다.

### 8-3. 법적·윤리 전제 (제품 요구사항으로 구현)

- 회의 봇 참석 시 참석자 전원에게 **참석 고지**(봇 이름 "사수 (기록 중)" + 채팅 고지). 슬랙 채널 수집 시 채널 공지 자동 게시. `(확인 필요: 통신비밀보호법상 당사자 참여 녹음의 고지 요건 — 법률 자문 전까지는 "전원 고지 + 이의 시 채널 제외"를 기본값으로)`
- 멤버별 동의(`consented_at`) 전에는 그 사람의 발언을 저장하지 않는다(6-6).
- 수집 채널 목록은 세팅 화면에서 항상 공개. 채널 제거 = 본문·임베딩 삭제(원장에 인용된 quote는 보존 — 동의문에 명시).
- **미동의 구성원의 발언은 저장하지 않는다.** RLS는 접근 통제이지 수집의 법적 근거가 아니다. 근거는 동의이고, 동의가 채널 연결보다 먼저다(6-6).
- 고객 데이터는 모델 학습에 쓰지 않는다 (Groq API 정책 `(확인 필요 — §10 #20)`).
- 게스트 모드·스크린샷·데모 영상은 **합성 데이터만**. 우리 팀 실제 대화 노출 금지.
- **파일럿 동의문은 D9 전에 확정**한다(우리 팀 전원 서면 동의). 법률 자문은 대회 후지만, 실사용 데이터가 걸리는 시점은 D1이므로 "전원 고지 + 이의 시 채널 제외 + 원장 인용 보존 고지"를 첫날부터 적용한다.
- 제출서·데모 영상은 **실제로 동작하는 것만** 보여주고, 컷된 기능은 "로드맵"으로 구분해 적는다. 문서의 정교함이 "완성된 척"으로 읽히지 않게 하는 유일한 방법이다.
- 회사 업무로 만든 결과물이 아님을 확인 (직무발명·업무상저작물 유의사항).

### 8-4. 기술 제약

- Vercel 함수 타임아웃: 슬랙은 3초 내 ack, 무거운 처리는 분리. gpt-oss-120b 호출 1회가 30초를 넘을 수 있으므로 `maxDuration` 확인 `(확인 필요: 현재 플랜의 상한)`. 음성 전사는 10MB 상한으로 받고 원본을 저장하지 않는다.
- 문서 업로드: 20MB 상한, TXT·MD·CSV·JSON·PDF·DOCX만 허용한다. PDF/DOCX에서 추출한 텍스트와 마스킹된 chunk만 저장한다.
- Groq strict json_schema: 모든 필드 `required` + `additionalProperties: false`가 강제되고 optional 필드를 쓸 수 없다 — null이 정상인 필드는 nullable union으로 정의한다. properties 순서가 생성 순서를 보장하지 않으므로 "citations 먼저"는 프롬프트로 요구하고 인용 문자열 검증으로 확인한다. `stop_reason: refusal`이 없으므로 거절은 `refused` 필드·인용 0개로 판정한다.
- 임베딩 차원은 모델 확정 전까지 스키마에 고정하지 않는다(D2 확정). 현재는 Voyage `voyage-4-lite`의 1024차원으로 고정한다.
- 1인 개발: 하루 마지막 커밋은 항상 배포 가능 상태. 9/17 이후 신기능 금지.

### 8-5. 비용

| 항목 | 지금 (파일럿 + 심사 기간) | 고객이 붙으면 |
|---|---|---|
| Groq API | 하루 ~200건 분류(gpt-oss-20b) + 카드·답변·회의 정리 수십 건(gpt-oss-120b) → **$100 이내** 상한, `llm_calls`로 측정. 단가는 `(확인 필요 — §10 #19)` | 부서당 월 수십 달러 → 부서 단위 과금($49~199)의 원가 |
| Recall.ai | `(확인 필요)` 회의 시간당 과금 | 회의 수에 비례 |
| Vercel | Cron 매분·`after()` 가능한 플랜 `(확인 필요: Pro 필요 가능성 — D0)` | 트래픽 비례 |
| Supabase | 무료 티어 | Pro 전환 시점 = 파일럿 2팀 |
| 임베딩 | 미미 | items 수 비례 |
| 도메인 | Vercel 기본 도메인 | 커스텀 도메인 연간 |

게스트 모드는 사전 실행 스냅샷이라 $0. 키는 공동 키 1개(ADR-020). 사람이 해야 할 결제·플랜 확인은 [setup-guide.md §12](setup-guide.md).

---

## 9. 12일 일정 (9/8 → 9/20)

외부 리뷰(Phase 5) 반영: 요일 정정(9/8은 **화**요일), 외부 서비스 확인을 D0(오늘)로 앞당김, 합성 데이터 콘텐츠를 D3~D5에 병행 작성, D8 오후를 명시적 버퍼로, 컷 라인 자동 발동 기준을 날짜에 박음.

| D | 날짜 | 작업 | 완료 기준 / 자동 컷 기준 |
|---|---|---|---|
| **D0** | 9/8 (화) 오전 | **구현 전 확인**: Vercel 플랜의 Cron 최소 간격·`after()` 상한 → 매분 불가면 Supabase `pg_cron`+`pg_net`으로 워커 트리거 확정 · Recall.ai 가입·가격·승인 소요 · 슬랙 앱 생성 + `users:read.email` 스코프 | §10 #1·#15·#16이 "확인됨"으로 바뀜 |
| D1 | 9/8 (화) | 리포·Supabase·Vercel 셋업, 스키마 v1, **jobs 워커 골격**(enqueue/runOnce + 트리거), 슬랙 이벤트 수신 200 | `main` 푸시 → 배포, 슬랙 메시지가 items에 쌓이고 job이 done으로 바뀜 |
| D2 | 9/9 (수) | 어댑터 공통 스키마, `llm.ts` 게이트웨이(+llm_calls), 정규식 마스킹, 규칙 분류 + gpt-oss-20b 분류, Voyage `voyage-4-lite`(1024차원) 확정 → embedding 컬럼 마이그레이션 | 코드·원격 DB 적용 완료 |
| D3 | 9/10 (목) | 결정 카드 생성(gpt-oss-120b, 인용 강제·검증), 웹 카드(S2). **병행: 게스트 합성 데이터 시나리오 작성 시작**(영업팀·개발팀 3주치 대화·회의·원칙 문서 텍스트) | 실제 슬랙 질문 1건이 카드가 되고 인용 링크가 원문으로 감 |
| D4 | 9/11 (금) | 슬랙 DM Block Kit + 버튼·모달 → 원장 기록, 원장 화면(S3), 리드타임, 7일 백필 | DM에서 결정 → 원장에 남고 스레드에 공지. **컷 ①**: 백필 미완이면 버림 |
| D5 | 9/12 (토) | **전사 업로드 파서 먼저** → Recall.ai 봇 연동, 회의 정리 생성. 합성 데이터 시나리오 완성 | 우리 팀 회의 1건이 화자 라벨 items로 들어옴(업로드든 봇이든) |
| D6 | 9/13 (일) | **봇 판정일**: 봇 전사가 items로 안 들어오면 업로드로 확정. 동일 안건 병합(슬랙 + 회의 → 카드 1장) | 데모 장면 3 성립. **컷 ③**: 병합 미완이면 "같은 형식의 카드 2장"으로 서사 조정 |
| D7 | 9/14 (월) | 노션 원칙 문서 1회 가져오기, Q&A(S4) + RLS 권한 차등(`can_see`·`search_as`), 인용 문자열 검증 | 팀장/팀원 계정에서 같은 질문의 답이 다름 (장면 4) |
| D8 | 9/15 (화) | 오전: 충돌 감지, 슬랙 @멘션 Q&A(채널은 member 권한). **오후: 버퍼 — D1~D7 밀린 것 + Codex 코드 리뷰(RLS·워커·서명 검증)** | 카드에 "3월 원칙과 충돌" 배지 + 인용. **컷 ④**: 회의 탭은 여기서 시간 남을 때만 |
| D9 | 9/16 (수) | 부서 세팅(S5 체크리스트·visibility), 동의(S0 + 슬랙 버튼)·채널 공지, ask 일일 상한, 파일럿 동의문 확정 | 채널 추가·제거가 수집에 반영, 미동의 멤버 마스킹 확인. **컷 ⑤⑥⑦** 판정 |
| D10 | 9/17 (목) | 게스트 모드: 준비된 합성 데이터로 **시드 실행 + 검증만**(부서 2개), `/demo`, **기능 프리징** | 시크릿 창에서 S1→S4 완주, 두 부서 같은 질문 다른 답 |
| D11 | 9/18 (금) | **참가 접수 마감** · 부하 테스트 · 폴리싱 · 에러 처리 | 접수 완료, 동시 100명 게스트 무사 |
| D12 | 9/19 (토) | 데모 영상(3분, 5장면) · 스크린샷 5장 · 제출서 최종(구현된 것/로드맵 구분 명시) · **제출** | 제출 확인 |
| 버퍼 | 9/20 (일) | 버그픽스만. 최종 제출 확인 23:59 전 | — |

Codex가 만든 코드 중 **RLS 정책·워커·슬랙 서명 검증**은 D8 오후에 사람이 직접 읽는다. 자기 채점은 하한선이다.

**진행 기록 (2026-09-13)** — D6~D10 구현 범위를 D6 하루에 앞당겨 완료하고 운영 반영했다. 실행 근거: [D10-completion.md](verification/D10-completion.md).
- 구현(phase `3-d6-d10-completion` step 0~14): 전사 줄 번호 오류 · jobs lease · 카드/결정/회의 쓰기 경계와 직접 결정 visibility · 72h 병합(ADR-037 LLM 확인) · 유사 결정 충돌 감지 · 채널 제거 · ASK 50회 상한 · 노션 다시 가져오기 · S0 동의와 슬랙 동의 버튼 · 게스트 디자인팀(4부서) · 병합·권한 E2E.
- 사람 코드 리뷰(D8 항목)는 9/13 수행, 수정 3건 반영(동의 DM 필수 고지 전문 · 답변 인용 질문자 격리 · 소스 트리거 INSERT 한정).
- 운영 PASS: 세로 슬라이스 · 슬랙+회의 병합 · lead/member 답변 차등 · `/demo` 4부서 완주·실데이터 0건.
- 남은 사람 작업: 슬랙 DM 버튼(결정·동의) 실클릭 · Groq Data Controls 확인 · 파일럿 구성원 서면 동의(D9) · 실제 채널 20건 재현율 채점 · 9/18 참가 접수. D10(9/17) 프리징은 유지한다 — 9/14~9/17은 버그픽스·폴리싱·부하 테스트만.
- 게스트 부서는 §8-0의 2개에서 4개(영업·개발·기획·디자인)로 늘었다(9/12 QA 요구).

---

## 10. 미확인 가설과 미결정 (구현 전·중에 풀 것)

| # | 항목 | 종류 | 다음 행동 | 기한 |
|---|---|---|---|---|
| 1 | Recall.ai 가격·승인 소요·무료 크레딧 | 확인 필요 | 가입·문서 확인, 안 되면 대체 API 또는 전사 업로드 | D1 |
| 2 | 임베딩 모델 | **확정** | Voyage AI `voyage-4-lite`, 1024차원. `VOYAGE_API_KEY`를 Vercel Production/Preview에 등록하고 기존 실데이터를 재임베딩 | D2 완료 |
| 3 | Notion 웹훅 지원 여부 | 확인 필요 | 문서 확인, MVP는 폴링으로 시작 | D7 |
| 4 | Vercel 함수 `maxDuration` 상한 | 확인 필요 | D0 플랜 확인. 초과 시 긴 작업(회의 정리·카드)을 더 잘게 job으로 쪼갠다. Edge Function은 쓰지 않는다(6-11) | D0 |
| 5 | 통신비밀보호법상 봇 참석 고지 요건 | 확인 필요 | 고지 + 이의 시 제외를 기본값으로, 자문은 대회 후 | 대회 후 |
| 6 | Groq API 학습 미사용 정책 | 확인 필요 | 약관 확인 후 제출서 문구 확정 | D12 |
| 7 | 두 번째 파일럿 팀 | 확인 필요 | 지인 회사 1곳 섭외 (주 3회 이상 회의, 5~20인). **실패 시 대체**: 데모데이 서사를 "1팀 4주 실데이터 + 게스트 2부서 데이터"로 조정하고, 기획서 §10 모의 심사의 "2팀" 조건이 약해졌음을 발표에서 숨기지 않는다 | 9/12 |
| 8 | 규칙 분류의 재현율 — "결정 필요"를 얼마나 놓치는가 | 가설 | 우리 팀 하루치 수동 채점 20건 → 규칙 보강 | D3 |
| 9 | 카드 추천 방향을 팀장이 실제로 채택하는가 | 가설 | 파일럿 기간 카드별 채택 여부 기록 | 파일럿 |
| 10 | 부서 격리가 맥락 오염을 실제로 줄이는가 | 가설 | 부서 1개 MVP로는 검증 불가 — 데모데이 이후 | 로드맵 |
| 11 | 서비스명 "사수" 유지 여부 (기획서 §11) | 미정 | 유지로 가정하고 진행, 제출 전 최종 | D11 |
| 12 | 커스텀 도메인 | 미정 | Vercel 기본 도메인으로 제출 가능 | D11 |
| 13 | Recall.ai 웹훅 서명 지원 여부·녹음 파일 보존 기간 | 확인 필요 | 문서 확인, 서명 없으면 URL 시크릿 + IP 제한. 전사 후 녹음 삭제 설정 | D5 |
| 14 | Groq API 데이터 보존 기간·삭제 옵션 | 확인 필요 | 약관 확인 → 제출서 "학습 미사용" 문구 근거 | D12 |
| 15 | 슬랙 `users:read.email` 스코프 승인 조건 | 확인 필요 | 워크스페이스 관리자 설치 시 가능한지 확인 | D1 |
| 16 | Vercel `after()` 지속 시간 상한, Cron 최소 간격(Hobby는 하루 1회일 수 있음) | 확인 필요 | 플랜 확인. 매분 Cron 불가면 Pro 전환 또는 외부 핑(cron-job.org) | D1 |
| 17 | 퇴사자 이름을 원장에 보존하는 법적 근거 | 확인 필요 | 파일럿 동의문에 "업무 기록으로 보존" 명시, 자문은 대회 후 | 대회 후 |
| 18 | 슬랙 `conversations.history` 백필의 레이트 리밋(Tier 3, 분당 50) | 확인 필요 | 7일치 채널 3개면 수 분 — job 1개, 페이지네이션 | D4 |
| 19 | Groq 토큰 단가·무료 티어·rate limit (gpt-oss-120b / 20b) | 확인 필요 | console.groq.com에서 확인 → §8-5 $100 상한 재계산. 티어 rate limit이 낮으면 워커 동시성이 아니라 `jobs` 백오프로 흡수 | D2 |
| 20 | Groq API 데이터 보존·학습 미사용 정책 | 확인 필요 | 약관 확인 → 제출서 문구·파일럿 동의문 (#6·#14와 같은 확인) | D12 |
| 21 | gpt-oss-120b의 한국어 생성 품질이 카드·답변에 충분한가 | 가설 | D3 카드 생성 시 우리 팀 실메시지로 육안 판정. 미달이면 순서는 ① 시스템 프롬프트 한국어 지시 강화 ② 인용 quote를 원문 그대로 쓰게 강제 ③ 그래도 미달이면 §8-2 컷이 아니라 모델 교체(같은 Groq 안에서) | D3 |

### 10-1. 가설별 영향과 판정 — 틀리면 무슨 일이 생기나

위 표의 항목 중 **구현 전에 확인해야 하는 것**과 **틀려도 감당 가능한 것**을 가른다. "구현 전에 확인"은 D0·D1의 사람 작업이다([setup-guide.md §0](setup-guide.md)).

| 가설 | 틀리면 무슨 일이 | 언제 어떻게 확인하나 | 판정 |
|---|---|---|---|
| Recall.ai 가격·승인·웹훅 서명이 12일 안에 쓸 만하다 (#1·#13) | 회의 채널이 전사 업로드로 격하, 데모 장면 3의 "회의 보류 안건"은 업로드로 재현 | D1 가입·문서 확인, **D6(9/13) 최종 판정** | 구현 전에 확인 |
| Vercel 플랜에서 Cron 매분 + `after()`가 된다 (#4·#16) | 워커가 못 돌아 비동기 전체 불성립 | **D0(오늘 오전)** 플랜 확인. 안 되면 Supabase pg_cron 트리거로 확정(대체안 설계 완료, ADR-010) | **구현 전에 확인** |
| 슬랙 `users:read.email` 스코프가 승인된다 (#15) | 신원 매핑 불가 → 슬랙 Q&A·버튼 거절 | D1 앱 생성 시 | 구현 전에 확인 |
| 임베딩 모델 한국어 품질이 병합·검색에 충분하다 (#2) | 병합 오탐·검색 누락 | D2 결정 기록. 첫 파일럿에서 검색 누락을 관찰 | OpenAI text-embedding-3-small로 MVP 진행 |
| 규칙 분류의 "결정 필요" 재현율 ≥ 0.7 (#8) | 카드가 안 생겨 데모가 수동 승격에 의존 | D3 하루치 20건 수동 채점 | 틀려도 감당 가능 (수동 승격 경로 존재) |
| 카드 추천 방향을 팀장이 채택한다 (#9) | 카드 가치 약화, 데모데이 지표 부진 | 파일럿 기간 채택률 기록 | 틀려도 감당 가능 |
| 두 번째 파일럿 팀을 9/12까지 섭외한다 (#7) | 데모데이 "2팀 실데이터" 불성립 → 서사를 "1팀 4주 실데이터 + 게스트 2부서"로 조정하고 약해진 조건을 숨기지 않는다 | 이번 주 지인 회사 1곳 | 구현과 무관, **즉시 행동** |
| Groq API 데이터 보존·학습 미사용 정책 (#6·#14) | 제출서 문구 수정 | D12 약관 확인 | 틀려도 감당 가능 |
| 봇 참석 고지·퇴사자 이름 보존의 법적 요건 (#5·#17) | 파일럿 동의문 보강 | 대회 후 자문. 지금은 "전원 고지 + 이의 시 제외" | 틀려도 감당 가능 |
| 슬랙 백필 레이트 리밋 (#18) | 백필이 수 분 걸림 | D4 | 틀려도 감당 가능 |
| 부서 격리가 맥락 오염을 줄인다 (#10) | 핵심 차별점 하나가 미검증 | 부서 1개로는 불가 — 데모데이 이후 | 이번 MVP 밖 |

---

## 11. 완료 판정 (검증 방법)

구현 도구의 자기 채점 점수는 하한선으로만 쓴다. 완료는 아래 검증이 **실제로 실행되었는지**로 판정한다.

| 기능 | 검증 |
|---|---|
| WATCH | 우리 팀 채널 하루치 20건을 수동 라벨링 → 규칙+LLM 분류와 비교, "결정 필요" 재현율 ≥ 0.7 `(가설 #8)`. 0.7은 근거 있는 상수가 아니라 **작업 임계**다: 데모는 수동 승격 경로로 성립하므로 이 수치는 파일럿 품질 기준이고, 미달 시 순서는 ① 규칙 패턴 보강 ② 분류 모델(gpt-oss-20b) 프롬프트에 오탐 예시 3건 추가 ③ confidence 임계 0.6→0.5 하향. 점수를 맞추려고 라벨을 바꾸지 않는다 |
| DECIDE | 슬랙 질문 1건 + 회의 보류 1건 → 카드 1장으로 병합, 인용 링크 클릭 시 원문 도달, DM 버튼으로 결정 시 원장·스레드 공지 확인 |
| LEDGER | 원칙과 충돌하는 결정 카드 1건에 충돌 배지 + 과거 결정 인용 표시 |
| ASK | 같은 질문을 lead/member 계정으로 → member 답에 `leads_only` 소스 인용이 없음(답변 JSON의 citation source visibility 전수 확인). 근거 없는 질문에 refused=true |
| 보안 | member 세션으로 `leads_only` items·citations·카드를 직접 select 시 0건, insert 시 거부 (RLS USING/WITH CHECK 테스트). lead가 **퍼블릭 채널**에서 `@사수`로 leads_only 내용을 물었을 때 답변에 해당 인용이 없음. leads_only 인용이 섞인 카드의 DM 수신자가 lead임. 서명 없는 슬랙 요청이 401 |
| 게스트 | 시크릿 창에서 `/demo` 완주, 우리 팀 실데이터 문자열이 응답에 없음(grep), 게스트 라우트의 LLM 호출 0회(`llm_calls` 증가 없음), 동시 100명 무사 |
| 게스트 부서 격리 | 같은 질문("단가 정책 어떻게 잡죠?")을 영업·개발 사수에게 → 각자 자기 부서 원칙만 인용, 상대 부서 items 인용 0건 (장면 4') |
| 엣지·에러 | 같은 슬랙 이벤트 2회 전송 → items 1건. 결정 버튼 연타 → decisions 1건 + "이미 결정됨" 응답. Groq 키를 잘못 넣고 질문 → 2분 내 `failed(llm_timeout|auth)` + 재시도 버튼. 잘못된 .vtt 업로드 → 줄 번호 포함 에러. items 0건 부서에서 질문 → LLM 호출 0회 |
| 음성·문서 | 음성 webm 녹음 → 전사 텍스트를 확인·수정 후 ASK가 `202`로 접수되고 원본 음성 row/파일이 없음. PDF/DOCX 업로드 → `summarize_document`가 `summarized`로 끝나며 요약 문장·액션의 인용 quote가 원문 chunk에 포함됨. leads_only 문서는 member에게 0건 |
| 운영 | 9/21~10/5 매일 1회 헬스체크. **우리가 통제 가능한 장애 0**(배포 실패·키 만료·시드 오류). Vercel·Supabase 플랫폼 장애는 상태 페이지 기록으로 구분해 두고 통제 밖으로 본다 |
| 제출 | 참가 접수 D0(9/8) 완료. 과제 제출은 "임시저장"이 아니라 **제출** 버튼까지(D12). 제출서·스크린샷에 컷된 기능이 "만든 것처럼" 없음 ([submission-checklist.md](submission-checklist.md) 제출 전 확인) |

Codex의 자기 보고("완료했습니다")는 완료 신호가 아니다. 위 표의 검증을 돌린 기록(스크린샷·쿼리 결과·E2E 로그)이 `docs/verification/`에 있어야 완료다(ADR-026). 단위·RLS·E2E의 경계는 [ARCHITECTURE.md §8](ARCHITECTURE.md), `/review` 체크리스트는 `.claude/commands/review.md`.

---

## 12. 렌즈 반영 이력 (Phase 3~4)

| 렌즈 | 고친 것 |
|---|---|
| **보안·권한** | ① 역할표 신설(6-9) — anon/member/lead/service role이 보는 것·하는 것·못 하는 것 ② `excluded_count` 노출 제거 — 기획서 §05 "존재 자체가 드러나지 않음"과 충돌했음. 감사 로그에만 기록 ③ 카드 visibility 상속 + leads_only 카드는 lead에게만 발송 ④ 채널 답변은 게시 위치 권한(member) 우선 — lead가 채널에서 물으면 leads_only 내용이 채널에 새는 경로 차단 ⑤ 결정 공지 스레드는 결과 한 줄 + 링크만 ⑥ 가시성 판정을 `can_see()` SQL 함수 하나로 통일, RLS는 USING+WITH CHECK ⑦ 게스트 판별을 이름 문자열에서 `is_demo` 플래그로 ⑧ 슬랙 신원 매핑(이메일 일치)·미매핑 사용자 거절·버튼 클릭자 검증 ⑨ 슬랙 서명 검증·봇 웹훅 인증·최소 스코프 ⑩ 로그 금지 항목과 감사 로그 고지 ⑪ 원본 권한 자동 상속을 로드맵으로 명시 ⑫ ask 일일 상한 |
| **엣지 케이스·에러** | ① 슬랙 재전송·폴링 중복 → `unique(source_id, external_ref)` + `ingest_events` 멱등 ② 결정 더블클릭·동시 결정 → `decisions.request_id unique`, 승격 중복 → partial unique index ③ LLM 실패 시 항목을 버리지 않고 `unclassified`/`needs_review`/`failed(error_code)`로 남김 ④ 긴 작업은 row 먼저 + 폴링 + 2분 스윕(영원한 스피너 금지) ⑤ 외부 의존성 9개별 장애 거동·사용자 문구·다음 행동 표(6-10) ⑥ 입력 상한·형식 오류·화자 미상·90분 회의 분할 ⑦ 마스킹이 금액을 지우지 않도록 규칙 명시 ⑧ 원문 삭제는 소프트 삭제로 인용 보존 ⑨ 병합 오탐 방지(72h·0.85·Haiku 확인) + lead 근거 제거 ⑩ DM 발송 실패 시 웹 카드 + lead 알림 ⑪ 빈 상태 5개 화면 정의 |
| **유저 플로우** | ① 팀원 동의 흐름이 없었음 → 슬랙 공지 [동의] 버튼 + 웹 S0 동의 화면 ② 회의 정리를 볼 화면이 없었음 → S1 회의 탭 ③ 보류·마감 경과 카드가 돌아오는 길이 없었음 → 보류 재발송·리마인드 cron(D6·D8) ④ 슬랙 앱 설치 흐름이 암묵적이었음 → 단일 워크스페이스 수동 설치로 고정, OAuth는 나중 ⑤ DM "자세히" 링크의 로그인 이탈 → DM 카드에 결정 재료 전부 포함 ⑥ 게스트 끝 CTA 없음 → 파일럿 문의·투표 링크 ⑦ 승격한 질문의 결과를 팀원이 모름 → S4 내 질문 이력 ⑧ 세팅 도중 이탈 → 체크리스트 진행률, 채널 1개만으로도 동작 ⑨ Mermaid 플로우(2-4) 추가 |
| **아키텍처** | ① "200 보내고 백그라운드 처리"가 서버리스에서 성립하지 않았음 → `jobs` 테이블 + 워커(`after()` + Cron 매분)로 단일 비동기 모델, Edge Function 배제 ② 회의 정리를 저장할 곳이 없었음 → `meetings` 테이블 ③ 비용 상한 $100을 측정할 데이터가 없었음 → `llm_calls` ④ 노션·슬랙 재시작 시 이어받을 커서가 없었음 → `sources.sync_cursor` ⑤ "도입 전후 리드타임 Δ"는 전 데이터가 없어 측정 불가 → 1주차 vs 4주차로 재정의 ⑥ 컴포넌트 계약을 `contracts.ts` Zod 단일 소스로, LLM 호출 지점을 `llm.ts` 하나로 ⑦ 10배 규모에서 깨지는 곳 5개 기록(대비는 안 함) ⑧ 리포 구조와 D1 일정에 워커 골격 반영 ⑨ 아키텍처 다이어그램(6-11) |
| **데이터·상태** | ① `decided_by`·`asked_by`가 `auth.users` 직접 참조 → 탈퇴 시 원장·감사 로그가 함께 지워지거나 삭제가 막힘 → `on delete set null` + 이름 스냅샷 ② 결정 정정 경로가 없었음 → `supersedes_id` append-only ③ 병합이 카드 visibility를 좁힐 수 있었음 → 좁아지는 병합 금지 ④ `author`가 이름 문자열뿐 → `author_ext_id` 추가 (당시엔 "동의 마스킹은 렌더 시점에"였으나 Phase 5에서 "미동의 발언 저장 안 함"으로 대체) ⑤ 원칙 문서가 `departments` 배열과 `sources` 두 곳 → `sources.is_principles`로 통일 ⑥ 임베딩 모델 교체 대비 `embed_model` ⑦ 동의문 개정 대비 `consent_version` ⑧ 상태 전이표 5종·보존/삭제 정책 6종·중복 저장 6곳의 진실 규칙 명시 ⑨ 채널 제거 시 인용 quote 보존을 동의문에 명시 ⑩ 채널 연결 백필 ⑪ 마이그레이션을 부를 결정 4개를 알고 감수 |
| **Phase 4 삭감** | 렌즈가 얹은 것 중 12개를 "나중"으로 (8-0 표): Haiku 인용 심판 · `excluded_count`+감사 로그 뷰 · 리마인드 cron · S4 이력 · 노션 폴링 · 병합 Haiku 확인 · 결정 후 충돌 재검사 · 정정 UI · 템플릿 2종 · 편집 재분류 · 지표 뷰 · (조건부) 회의 봇. 백필은 14일→7일. 컷 라인을 최종 범위 기준으로 재작성(8-2). 남은 범위: 화면 7 · job 9 · 연동 3 · 데모 장면 5 — 1인 감당 가능하되 여유 없음 |
| **Phase 5 외부 리뷰** (Codex + 맥락 없는 세션) | 공통 지적 4건 전부 반영(D3 게이트 · pg_cron 대체안 · 요일 정정 · 임베딩 컬럼 분리), Codex 단독 7건, 세션 단독 4건 반영, 미반영 3건과 이유 → **§12-1** |

### 12-1. Phase 5 외부 리뷰 상세

리뷰어 둘: **Codex CLI**(다른 모델, 2026-09-08)와 **맥락 없는 새 세션**(이 문서를 만든 과정을 모르는 상태로 PRD만 읽음). 둘 다 "칭찬 생략, 결함만"으로 요청.

**두 리뷰가 공통으로 지적한 것 → 전부 반영**

| 지적 | 반영 |
|---|---|
| 12일에 전체 범위는 비현실적. 컷 라인이 사후 손절일 뿐 사전 리스크 분산이 아님 | 범위는 사용자 결정(채널 3개)이라 유지하되 **D3 세로 슬라이스 게이트**(8-2 ⓪, ADR-025)를 신설해 3일 안에 강등을 강제 판정. D8 오후를 버퍼 + Codex 코드 리뷰(RLS·워커·서명) 시간으로. 합성 데이터 콘텐츠를 D3~D5에 병행 작성해 D10 부하 분산 |
| 매분 Cron·`after()` 전제가 미검증인데 설계 기반 전체가 그 위에 있음 | D0(오늘 오전) 확인으로 앞당김. 대체안(Supabase `pg_cron`+`pg_net`)을 설계에 포함(ADR-010). 워커 코드는 트리거와 무관 |
| §9 요일이 전부 하루씩 틀림 (9/8은 화요일) | 정정. 9/20(일)은 버퍼로 분리 |
| `vector(1024)`를 박아두고 "미정"이라 함 | 임베딩 컬럼을 스키마 v1에서 빼고 D2 마이그레이션으로 (ADR-018) |

**Codex만 지적한 것 → 반영**

- 동의 전 수집의 법적 근거 없음("RLS는 접근 통제이지 수집 근거가 아니다") → **미동의 멤버 발언은 저장하지 않음**, 동의가 채널 연결보다 먼저(체크리스트 0단계). 이름만 가리는 방식 폐기 (ADR-021)
- 삭제 정책 불일치(6-6 소프트 vs 6-12 하드) → 본문·임베딩 삭제 + quote 보존으로 통일 (ADR-022)
- 내부 모순 15건(화면 수, U10, S4 이력, `excluded_count`, 편집 재분류, 템플릿 수, job 수, Edge Function, `NEXT_PUBLIC_`, 참가 접수 시점, RLS 대상 테이블, 노션 "상시 관찰" 문구, 요일) → 전부 정정. 대부분 Phase 4 삭감 후 앞 절을 안 고친 흔적
- "범용 AI와 나란히 비교"가 미명세 → 시드 시 `generic_answer` 저장, 비교 기준은 "부서 원칙·결정을 인용했는가" 하나
- 부서 세팅·게스트 모드가 P1인데 실제로는 필수 → P0
- "다운타임 0"이 통제 밖 장애를 포함 → 통제 가능한 장애 0으로 한정
- 참가 접수를 마감일에 배치 → D0에 제출

**새 세션만 지적한 것 → 반영**

- 핵심 차별점 "부서 격리"가 데모에서 검증되지 않음(부서 1개, 권한 차등은 RBAC 데모일 뿐) → 게스트 모드를 부서 2개(영업·개발)로, 같은 질문에 다른 부서 원칙을 인용하는 장면 4' 추가. 비용은 데이터뿐 (ADR-019)
- 두 번째 파일럿 팀 실패 시 대체 없음 → "1팀 실데이터 + 게스트 2부서" 서사로 조정하고 약해진 조건을 숨기지 않음 (ADR-006)
- 재현율 0.7의 근거 없음 → 작업 임계로 규정, 미달 대응 순서 명시, 라벨은 안 바꿈 (§11)
- DM 버튼 컷(⑤)이 유저 플로우 렌즈의 이탈 방지 원칙을 되돌림 → 트레이드오프를 컷 라인에 명시 (8-2)

**반영하지 않은 것과 이유** (ADR 부록에도 기록)

- Codex: "회의는 처음부터 업로드만 쓰거나 MVP에서 제외" → 사용자가 회의 봇을 명시적으로 선택했고, 봇은 Lindy·Otter와 같은 방식이라 실현 가능성 어필에 유리. 업로드 파서를 먼저 만들고 D6 판정으로 리스크 상한을 둔 것으로 갈음 (ADR-005)
- Codex: "현실적 MVP는 합성 데모 + 슬랙 1채널 + 웹 카드·원장" → D3 게이트가 실패하면 정확히 이 범위로 강등된다. 지금 미리 줄이지 않는 이유는 검토 끝에 뺀 것과 검토 없이 없는 것이 다르기 때문(plan-forge Phase 4 원칙)
- 세션: "12일 일정은 비현실적" → 동의하되, 일정 연장은 불가(대회 마감). 대응은 범위 축소가 아니라 판정 시점 앞당김

---

## 유지

구현 중 결정이 바뀌면 이 문서의 §3(기능)·§8(범위·컷 라인)·§4(기술 스택)를 먼저 고치고 [ADR.md](ADR.md)에 ADR을 추가한다. ARCHITECTURE.md·setup-guide.md·submission-checklist.md·`01-plan/`·`02-design/` 어댑터는 그 다음이다. 코드만 바꾸고 문서를 두지 않는다.
