import Image from "next/image";
import Link from "next/link";

import { SiteCta } from "@/components/site-cta";
import { siteLinks } from "@/lib/site";

const problems = [
  ["팀장", "회의에 갇힌 결정을 정리해 전달할 시간이 없습니다."],
  ["팀원", "무엇이 정해졌는지, 누구에게 물어야 하는지 몰라 일이 막힙니다."],
  ["부서", "결정이 채팅과 회의에 흩어져 어느 시스템에도 남지 않습니다."],
];

const steps = [
  ["01", "동의를 먼저 받습니다", "구성원 동의가 끝난 채널만 연결합니다."],
  ["02", "입력을 자동 분류합니다", "슬랙·회의·문서에서 결정이 필요한 신호를 찾습니다."],
  ["03", "담당자에게 카드를 보냅니다", "마감·충돌·추천 방향과 원문 인용을 함께 보냅니다."],
  ["04", "결정 원장에 기록합니다", "누가·언제·왜·어떤 근거로 결정했는지 남깁니다."],
  ["05", "권한 안에서 답합니다", "질문자가 볼 수 있는 기록만 검색하고 원문을 인용합니다."],
];

const trustItems = [
  "동의가 수집보다 먼저",
  "미동의 구성원 발언은 저장하지 않음",
  "인용 없는 문장은 보여주지 않음",
  "권한은 데이터베이스 RLS가 집행",
  "저장 전 개인정보 마스킹",
  "모델 제공사 ZDR 설정",
];

export default function HomePage() {
  const links = siteLinks();
  return (
    <main>
      <section className="relative border-b border-black/10 bg-[var(--hero)]">
        <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:py-20">
          <div className="grid gap-7">
            <p data-meta className="m-0 text-sm font-semibold tracking-[0.18em] text-[var(--accent)]">부서별 결정 사수 AI</p>
            <h1 className="m-0 max-w-3xl text-5xl leading-[1.12] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
              회의록은 남들도 만듭니다.<br />사수는 <span className="text-[var(--urgent)]">결정</span>을 만듭니다.
            </h1>
            <p className="m-0 max-w-2xl text-lg leading-8 text-[var(--muted)] sm:text-xl">
              슬랙과 회의에 묻힌 ‘지금 결정해야 할 것’을 담당자에게 카드로 보내고, 내려진 결정은 근거와 함께 부서 원장에 남깁니다.
            </p>
            <SiteCta links={links} />
            <p className="m-0 text-sm text-[var(--muted)]">가상 회사 ‘온새미로’의 합성 데이터로 둘러봅니다 · 가입 없음</p>
          </div>
          <div className="relative overflow-hidden rounded-[2rem] border border-black/10 bg-white shadow-2xl shadow-black/10">
            <Image
              alt="게스트 모드의 결정 카드: 배경, 원문 근거 인용 2건, 과거 결정과 충돌 확인, 추천 방향 (합성 데이터)"
              className="h-auto w-full"
              height={666}
              priority
              sizes="(max-width: 1024px) 100vw, 55vw"
              src="/marketing/guest-decision-card.png"
              width={832}
            />
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-9 px-5 py-20 sm:px-8">
        <div className="grid gap-3">
          <p data-meta className="m-0 text-sm text-[var(--urgent)]">결정의 공백</p>
          <h2 className="m-0 text-4xl sm:text-5xl">결정은 내렸는데, 아무도 모릅니다</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {problems.map(([title, body]) => (
            <article className="grid gap-5 rounded-3xl border border-black/10 bg-[var(--surface)] p-7" key={title}>
              <strong className="text-xl text-[var(--accent)]">{title}</strong>
              <p className="m-0 leading-7 text-[var(--muted)]">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-[var(--ink)] text-[var(--bg)]" id="how">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-20 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="grid gap-3"><p data-meta className="m-0 text-sm text-[var(--signal)]">WATCH → DECIDE → LEDGER → ASK</p><h2 className="m-0 text-4xl sm:text-5xl">흘려보내지 않는 다섯 단계</h2></div>
            <Link className="text-[var(--signal)]" href="/demo">데모에서 직접 보기 →</Link>
          </div>
          <ol className="m-0 grid list-none gap-px overflow-hidden rounded-3xl bg-white/15 p-px md:grid-cols-5">
            {steps.map(([number, title, body]) => (
              <li className="grid content-start gap-5 bg-[var(--ink)] p-6" key={number}>
                <span data-meta className="text-[var(--signal)]">{number}</span><strong className="text-lg">{title}</strong><p className="m-0 text-sm leading-6 opacity-70">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-20 sm:px-8" id="difference">
        <div className="grid gap-3"><p data-meta className="m-0 text-sm text-[var(--urgent)]">기록 다음의 층</p><h2 className="m-0 text-4xl sm:text-5xl">여기까지는 남들도 합니다</h2></div>
        <div className="grid gap-5 md:grid-cols-2">
          <article className="rounded-3xl border border-black/10 p-7"><p data-meta className="m-0 text-sm text-[var(--muted)]">기존 도구</p><h3 className="mt-3 text-2xl">기록 · 요약 · 검색</h3><p className="mb-0 leading-7 text-[var(--muted)]">회의와 대화를 잘 남기고, 필요한 내용을 다시 찾게 합니다.</p></article>
          <article className="rounded-3xl bg-[var(--accent)] p-7 text-white"><p data-meta className="m-0 text-sm text-[var(--signal)]">사수가 서는 층</p><h3 className="mt-3 text-2xl">요청 · 결정 · 권한별 답변</h3><p className="mb-0 leading-7 text-white/75">결정할 사람에게 먼저 밀어주고, 결정 원장과 부서별 권한으로 다음 행동까지 이어갑니다.</p></article>
        </div>
        <figure className="m-0 grid gap-4 rounded-3xl border border-black/10 bg-white p-4 shadow-xl shadow-black/5 sm:p-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <Image alt="영업 사수의 답: 같은 질문에 영업 원칙과 슬랙 원문을 인용한 게스트 화면 (합성 데이터)" className="h-auto w-full" height={291} sizes="(max-width: 1024px) 100vw, 50vw" src="/marketing/guest-ask-sales.png" width={1088} />
            <Image alt="개발 사수의 답: 같은 질문에 개발 부서에는 해당 기록이 없다고 답한 게스트 화면 (합성 데이터)" className="h-auto w-full" height={271} sizes="(max-width: 1024px) 100vw, 50vw" src="/marketing/guest-ask-dev.png" width={1088} />
          </div>
          <figcaption className="text-sm text-[var(--muted)]">같은 질문을 영업·개발 사수에게 물었습니다. 각 사수는 자기 부서 기록만 인용합니다. 게스트 모드 실제 화면이며 데이터는 합성입니다.</figcaption>
        </figure>
      </section>

      <section className="border-y border-black/10 bg-[var(--surface)]" id="trust">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-20 sm:px-8">
          <div className="grid gap-3"><p data-meta className="m-0 text-sm text-[var(--accent)]">TRUST BY DESIGN</p><h2 className="m-0 text-4xl sm:text-5xl">동의와 권한이 먼저입니다</h2></div>
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {trustItems.map((item, index) => <li className="flex min-h-28 items-start gap-4 rounded-2xl border border-black/10 p-5" key={item}><span data-meta className="text-[var(--accent)]">0{index + 1}</span><strong className="leading-7">{item}</strong></li>)}
          </ul>
        </div>
      </section>

      {links.trailerDemoUrl ? (
        <section className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8">
          <div className="grid gap-6 rounded-[2rem] bg-[var(--trailer)] p-8 text-white sm:p-12 md:grid-cols-[1fr_auto] md:items-end">
            <div className="grid gap-3"><p data-meta className="m-0 text-sm text-[var(--signal)]">합성 사례 · 베타</p><h2 className="m-0 text-4xl">입사 전에는 예고편, 입사 후에는 사수</h2><p className="m-0 max-w-3xl leading-7 text-white/75">AI는 지원자를 거르지 않습니다. 담당자가 참고할 근거만 정리합니다 — 지금은 합성 지원자로 시연합니다.</p></div>
            <Link className="w-fit rounded-full bg-white px-5 py-3 font-bold text-[var(--trailer)] no-underline" href={links.trailerDemoUrl}>예고편 체험하기 →</Link>
          </div>
        </section>
      ) : null}

      <section className="bg-[var(--hero)]" id="pilot">
        <div className="mx-auto grid w-full max-w-7xl gap-7 px-5 py-20 sm:px-8">
          <h2 className="m-0 max-w-4xl text-4xl leading-tight sm:text-6xl">우리 부서의 결정,<br />지금 어디에 남고 있나요?</h2>
          <SiteCta links={links} />
        </div>
      </section>
    </main>
  );
}
