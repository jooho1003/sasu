import Link from "next/link";
import { SiteCta } from "@/components/site-cta";
import { BrandMark, Icon, type IconName } from "@/components/ui/icon";
import { siteLinks } from "@/lib/site";

const benefits: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "chat",
    title: "팀장은 결정에 집중하고.",
    body: "대화 속 결정 요청을 찾아 배경과 근거를 함께 정리합니다. 담당자는 필요한 맥락부터 확인하세요.",
  },
  {
    icon: "book",
    title: "팀원은 맥락을 이어받고.",
    body: "누가, 언제, 왜 결정했는지 한곳에 남깁니다. 다시 묻고 기다리던 시간을 줄여보세요.",
  },
  {
    icon: "spark",
    title: "팀의 기록은 답이 됩니다.",
    body: "궁금한 점을 물으면 부서의 원칙과 지난 결정을 바탕으로 답합니다. 출처를 바로 확인할 수 있습니다.",
  },
];
const steps = [
  ["01", "동의부터", "동의한 구성원의 채널만 연결합니다."],
  ["02", "맥락 수집", "슬랙·회의·문서에서 결정 신호를 찾습니다."],
  ["03", "결정 요청", "담당자에게 원문 근거와 카드를 보냅니다."],
  ["04", "원장 기록", "결정과 그 이유를 함께 남깁니다."],
  ["05", "근거로 답변", "질문자의 권한 안에서 기록을 인용합니다."],
];

export default function HomePage() {
  const links = siteLinks();
  return (
    <main>
      <section className="marketing-hero">
        <div className="hero-label">
          <span className="status-dot" />
          우리 팀의 맥락을 아는 AI 동료
        </div>
        <h1>
          대화가 쌓이는 곳에서,
          <br />
          사수는 <span>결정</span>을 만듭니다.
        </h1>
        <p className="hero-description">
          슬랙과 회의에 흩어진 이야기, 이제 다음 행동으로.
          <br />
          결정할 순간을 찾고, 근거를 남기고, 팀의 질문에 답합니다.
        </p>
        <div className="hero-actions">
          <SiteCta links={links} />
        </div>
        <p className="hero-footnote">
          가입 없이 바로 체험 · 가상 회사의 합성 데이터
        </p>
        <div
          className="product-preview"
          aria-label="사수 결정 카드 미리보기 · 합성 예시"
        >
          <div className="preview-window">
            <div className="preview-titlebar">
              <span className="window-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>온새미로 · 영업 사수</span>
              <span className="badge badge-green">합성 예시</span>
            </div>
            <div className="preview-layout">
              <div className="preview-sidebar" aria-hidden="true">
                <span className="brand">
                  <BrandMark small />
                  사수
                </span>
                <span>
                  <Icon name="grid" size={15} />
                  대시보드
                </span>
                <span>
                  <Icon name="chat" size={15} />
                  묻기
                </span>
                <span>
                  <Icon name="book" size={15} />
                  원장
                </span>
              </div>
              <div className="preview-main">
                <h2>좋은 결정의 시작, 여기서.</h2>
                <p>흩어진 맥락을 모았습니다. 이제 함께 확인해보세요.</p>
                <div className="preview-card">
                  <span className="badge badge-urgent">결정 필요</span>
                  <h3>외주사 B 12% 인상 견적을 받아들일까요?</h3>
                  <q>
                    외주사 B 견적이 12% 올랐습니다. 이번 견적을 받아도 될까요?
                    오늘 17시까지 방향이 필요합니다.
                  </q>
                  <footer>
                    <span>슬랙 · 영업팀 합성 대화</span>
                    <Link className="text-link" href="/demo">
                      근거와 함께 살펴보기 <Icon name="arrow" size={13} />
                    </Link>
                  </footer>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <div className="integration-strip">
        <span>팀이 일하던 곳에서 시작합니다</span>
        <span>
          <Icon name="hash" size={18} />
          <strong>슬랙</strong>
        </span>
        <span>
          <Icon name="file" size={18} />
          <strong>노션</strong>
        </span>
        <span>
          <Icon name="video" size={18} />
          <strong>회의 전사</strong>
        </span>
        <span>
          <Icon name="book" size={18} />
          <strong>업로드 문서</strong>
        </span>
      </div>
      <section className="marketing-section" id="difference">
        <div className="section-intro">
          <p className="eyebrow">함께 일하는 새로운 방식</p>
          <h2>
            결정의 앞뒤를,
            <br />
            팀이 함께 알 수 있도록.
          </h2>
          <p>
            기록을 찾느라 멈추지 않도록. 사수가 팀의 대화와 결정을 연결합니다.
          </p>
        </div>
        <div className="benefit-grid">
          {benefits.map((item) => (
            <article className="benefit-card" key={item.title}>
              <span className="feature-icon">
                <Icon name={item.icon} />
              </span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="how-section" id="how">
        <div className="marketing-section">
          <p className="eyebrow">사수와 일하는 흐름</p>
          <h2>
            대화에서 결정까지.
            <br />
            자연스럽게 이어집니다.
          </h2>
          <ol className="how-steps">
            {steps.map(([number, title, body]) => (
              <li key={number}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className="marketing-section">
        <div className="section-intro">
          <p className="eyebrow">우리 팀의 맥락으로</p>
          <h2>
            같은 질문에도,
            <br />
            우리 부서에 맞는 답.
          </h2>
          <p>
            영업 사수와 개발 사수에게 같은 질문을 해보세요. 각 부서가 볼 수 있는
            기록과 원칙에 따라 답이 달라집니다.
          </p>
        </div>
        <div className="difference-grid">
          <article>
            <span className="eyebrow">일반적인 질문의 답</span>
            <h3>보편적인 지식을 바탕으로.</h3>
            <p>
              일반적인 방법과 조언을 제공합니다. 우리 팀에서 어떤 이야기가
              오갔는지는 알기 어렵습니다.
            </p>
          </article>
          <article>
            <span className="eyebrow">사수의 답</span>
            <h3>팀이 남긴 근거를 바탕으로.</h3>
            <p>
              실제 결정과 부서 원칙을 인용합니다. 확인할 근거가 부족할 때는
              부족하다고 알려줍니다.
            </p>
            <Link className="text-link" href="/demo">
              부서별 답변 비교하기 <Icon name="arrow" size={15} />
            </Link>
          </article>
        </div>
      </section>
      <section className="border-y border-black/5 bg-white" id="trust">
        <div className="marketing-section">
          <div className="section-intro">
            <p className="eyebrow">안심하고 함께 일하도록</p>
            <h2>신뢰는 기본입니다.</h2>
            <p>팀의 기록을 다루는 일인 만큼, 동의와 접근 권한부터 챙깁니다.</p>
          </div>
          <ul className="trust-grid">
            {[
              "구성원 동의 후 수집",
              "미동의 발언은 저장하지 않음",
              "원문 근거가 있는 답변",
              "부서와 사용자 권한별 접근",
              "저장 전 개인정보 마스킹",
              "질문자가 볼 수 있는 기록만 인용",
            ].map((item) => (
              <li key={item}>
                <Icon name="check" size={17} />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>
      {links.trailerDemoUrl ? (
        <section className="marketing-section">
          <div className="difference-grid">
            <div>
              <p className="eyebrow">합성 사례 · 베타</p>
              <h2>
                입사 전에는 예고편,
                <br />
                입사 후에는 사수.
              </h2>
            </div>
            <div className="flex flex-col items-start justify-center gap-5">
              <p className="text-sm leading-7 text-muted">
                직무의 실제 맥락을 먼저 경험하세요. AI는 담당자가 참고할 근거를
                정리하고, 최종 판단은 사람이 합니다.
              </p>
              <Link
                className="button button-secondary"
                href={links.trailerDemoUrl}
              >
                예고편 체험하기 <Icon name="arrow" size={16} />
              </Link>
            </div>
          </div>
        </section>
      ) : null}
      <section className="marketing-cta" id="pilot">
        <div className="marketing-section">
          <p className="eyebrow">우리 팀의 다음 결정부터</p>
          <h2>
            일 잘하는 팀 곁에,
            <br />
            사수.
          </h2>
          <p>먼저 둘러보세요. 우리 팀의 일하는 방식이 보일 거예요.</p>
          <div className="hero-actions">
            <SiteCta links={links} />
          </div>
        </div>
      </section>
    </main>
  );
}
