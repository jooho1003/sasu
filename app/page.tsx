import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>사수</h1>
      <Link href="/demo">게스트 모드 보기</Link>
    </main>
  );
}
