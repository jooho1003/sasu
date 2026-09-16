const base = (process.argv[2] ?? process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/u, "");
const cookies = new Map();

function rememberCookies(headers) {
  const values = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : (headers.get("set-cookie")?.split(/,(?=[^;,]+=)/u) ?? []);
  for (const value of values) {
    const pair = value.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}

async function visit(path) {
  let url = new URL(path, base);
  for (let redirect = 0; redirect < 8; redirect += 1) {
    const response = await fetch(url, {
      redirect: "manual",
      headers: cookies.size > 0
        ? { cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; ") }
        : {},
    });
    rememberCookies(response.headers);
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) throw new Error(`${url.pathname} 리다이렉트에 location이 없습니다.`);
    url = new URL(location, url);
  }
  throw new Error(`${path} 리다이렉트가 8회를 넘었습니다.`);
}

const demo = await visit("/demo");
if (demo.status !== 200) throw new Error(`/demo 응답 실패: ${demo.status}`);
const html = await demo.text();
for (const text of ["심사위원 데모 계정으로 접속했습니다", "전체 기능을 순서대로 확인하세요"]) {
  if (!html.includes(text)) throw new Error(`/demo에서 '${text}'를 찾지 못했습니다.`);
}

const checks = [
  ["분류 대시보드", "/demo/d/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
  ["지금 결정 카드", "/demo/d/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cards/10000000-0000-4000-8000-000000000121"],
  ["결정 원장", "/demo/d/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/ledger"],
  ["권한 인지 묻기", "/demo/d/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/ask?q=vendor-price"],
  ["음성·자료 검토", "/demo/d/cccccccc-cccc-4ccc-8ccc-cccccccccccc/reviews"],
  ["문서 어시스턴트", "/demo/d/cccccccc-cccc-4ccc-8ccc-cccccccccccc/documents"],
  ["문서 평가", "/demo/d/cccccccc-cccc-4ccc-8ccc-cccccccccccc/roles"],
  ["기록 보존", "/demo/d/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/retention"],
  ["부서 세팅", "/demo/d/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/settings"],
  ["조직 관리", "/demo/admin"],
  ["채용 예고편", "/demo/d/cccccccc-cccc-4ccc-8ccc-cccccccccccc/trailers"],
];

for (const [label, path] of checks) {
  if (!html.includes(`href="${path.replaceAll("&", "&amp;")}"`)) {
    throw new Error(`/demo에서 '${label}' 링크를 찾지 못했습니다.`);
  }
  const target = await visit(path);
  if (target.status !== 200) throw new Error(`${path} 응답 실패: ${target.status}`);
}

console.log(JSON.stringify({
  base,
  demo: demo.status,
  account: "connected",
  features: checks.map(([label, path]) => ({ label, path, status: 200 })),
}, null, 2));
