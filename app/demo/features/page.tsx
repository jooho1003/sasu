import Link from "next/link";
import { DEMO_FEATURES, DEMO_DEFAULT_DEPT_ID, DEMO_DEPARTMENT_IDS } from "@/lib/demo-access";

export default async function DemoFeatureMap({ searchParams }: { searchParams: Promise<{ dept?: string }> }) {
  const { dept: requested } = await searchParams;
  const dept = DEMO_DEPARTMENT_IDS.find(id => id === requested) ?? DEMO_DEFAULT_DEPT_ID;
  const base = `/demo/d/${dept}`;
  return <main className="demo-landing"><Link className="text-link" href={base}>← 현재 부서로 돌아가기</Link><header className="demo-intro"><p className="eyebrow">사수 사용 안내</p><h1>전체 기능 지도</h1><p>기록을 연결하고, 근거를 확인하고, 결정과 이유를 남기는 흐름입니다.</p></header>
    <ol className="demo-map-flow"><li>① 기록 수집<br /><small>슬랙 · 회의 · 문서</small></li><li>② 분류와 근거 확인<br /><small>대시보드 · 결정 카드</small></li><li>③ 판단과 기록<br /><small>결정 · 보류 · 원장</small></li><li>④ 기록 활용<br /><small>묻기 · 평가 · 예고편</small></li></ol>
    <section className="demo-capabilities"><h2>기능별로 직접 체험하기</h2><p>선택한 부서의 화면으로 연결됩니다. 입력과 설정 변경은 브라우저 안에서 체험하며 공용 데이터에 저장되지 않습니다.</p><ol className="demo-feature-grid">{DEMO_FEATURES.map(feature => {
      const href = feature.key === "admin" ? "/demo/admin" : feature.key === "notion" ? "/demo/notion" : feature.key === "card" ? `${base}#demo-cards-heading` : `${base}${feature.key === "dashboard" ? "" : `/${feature.key}`}`;
      return <li key={feature.key}><Link href={href}><span className="demo-feature-copy"><strong>{feature.title}</strong><span>{feature.description}</span><small>화면 열기 →</small></span></Link></li>;
    })}</ol></section></main>;
}
