// Discards leftover active/saving test recording sessions through the product API (lead session, local QA only).
import { BASE, DEPT, sessionCookies } from "./common.mjs";

const { cookies } = await sessionCookies();
const cookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
const list = await (await fetch(`${BASE}/api/d/${DEPT}/recordings`, { headers: { cookie }, cache: "no-store" })).json();
const keep = new Set(process.argv.slice(2));
for (const r of list.recordings ?? []) {
  if (keep.has(r.id)) continue;
  const res = await fetch(`${BASE}/api/d/${DEPT}/recordings/${r.id}/discard`, { method: "POST", headers: { cookie, "content-type": "application/json", origin: BASE }, body: "{}" });
  console.log(JSON.stringify({ id: r.id, title: r.title, state: r.state, discard: res.status }));
}
console.log(JSON.stringify({ remaining: ((await (await fetch(`${BASE}/api/d/${DEPT}/recordings`, { headers: { cookie }, cache: "no-store" })).json()).recordings ?? []).length }));
