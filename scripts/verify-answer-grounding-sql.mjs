import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function verifyAnswerGroundingSql({ q, check, asUser }) {
  const ids = Object.fromEntries(["org", "dept", "otherDept", "lead", "member", "stranger", "old", "unembedded", "private", "other", "superseded", "replacement", "source", "item", "item2", "answer"].map(key => [key, randomUUID()]));
  const vector = JSON.stringify([1, ...Array(1023).fill(0)]);
  const unrelated = JSON.stringify([0, 1, ...Array(1022).fill(0)]);
  await q("insert into orgs(id,name) values($1,'Grounding QA')", [ids.org]);
  await q("insert into departments(id,org_id,name) values($1,$3,'Grounding'),($2,$3,'Other')", [ids.dept, ids.otherDept, ids.org]);
  await q("insert into auth.users(id) values($1),($2),($3)", [ids.lead, ids.member, ids.stranger]);
  await q("insert into members(user_id,dept_id,role,display_name,consented_at) values($1,$4,'lead','Lead',now()),($2,$4,'member','Member',now()),($3,$5,'lead','Other',now())", [ids.lead, ids.member, ids.stranger, ids.dept, ids.otherDept]);
  const insert = async (id, outcome, embedding, options = {}) => q("insert into decisions(id,dept_id,decided_by,decided_by_name,outcome,rationale,decided_at,embedding,embed_model,visibility,supersedes_id) values($1,$2,$3,'Lead',$4,'결정 이유',$5,$6::vector,'voyage-4-lite',$7,$8)", [id, options.dept ?? ids.dept, ids.lead, outcome, options.at ?? "2026-09-22", embedding, options.visibility ?? "dept", options.supersedes ?? null]);
  await insert(ids.old, "과거 계약 기준", vector, { at: "2020-01-01" });
  for (let index = 0; index < 5; index++) await insert(randomUUID(), `최근 무관한 결정 ${index}`, unrelated);
  await insert(ids.unembedded, "재입찰 견적 기준", null);
  await insert(ids.private, "비공개 계약 기준", vector, { visibility: "leads_only" });
  await insert(ids.other, "다른 부서 계약 기준", vector, { dept: ids.otherDept });
  await insert(ids.superseded, "이전 계약 기준", vector);
  await insert(ids.replacement, "정정 계약 기준", vector, { supersedes: ids.superseded });
  const search = async (user, scope = "user", text = "계약", limit = 8) => (await q("select * from search_decisions_as($1,$2,$3::vector,$4,$5,$6)", [user, ids.dept, vector, text, limit, scope])).rows;
  await check("answer terms: Korean particles retain unembedded decisions", async () => {
    await asUser(ids.member, async () => assert.ok((await search(ids.member, "user", "견적은 어떻게 정했나요")).some(row => row.id === ids.unembedded)));
  });
  await check("answer terms: latest question survives more than 32 earlier words", async () => {
    const text = Array.from({ length: 40 }, (_, index) => `aaa${String(index + 1).padStart(2, "0")}`).join(" ") + "\n재입찰";
    await asUser(ids.member, async () => assert.ok((await search(ids.member, "user", text)).some(row => row.id === ids.unembedded)));
  });
  await check("answer terms: security definer and execute grants stay intact", async () => {
    const signature = "search_decisions_as(uuid,uuid,vector,text,integer,text)";
    assert.equal((await q("select prosecdef from pg_proc where oid=$1::regprocedure", [signature])).rows[0].prosecdef, true);
    for (const [role, expected] of [["anon", false], ["authenticated", true], ["service_role", true]]) {
      assert.equal((await q("select has_function_privilege($1,$2,'EXECUTE') allowed", [role, signature])).rows[0].allowed, expected);
    }
  });
  await check("answer retrieval: old relevant and unembedded lexical decisions survive recent unrelated decisions", async () => {
    await asUser(ids.member, async () => {
      const rows = await search(ids.member);
      assert.ok(rows.some(row => row.id === ids.old));
      assert.ok((await search(ids.member, "user", "재입찰 견적")).some(row => row.id === ids.unembedded));
      assert.ok(!rows.some(row => row.outcome.startsWith("최근 무관")));
    });
  });
  await check("answer retrieval: current decisions, tenant isolation, member/channel permissions and impersonation", async () => {
    await asUser(ids.lead, async () => {
      assert.ok((await search(ids.lead)).some(row => row.id === ids.private));
      assert.ok(!(await search(ids.lead, "channel")).some(row => row.id === ids.private));
    });
    await asUser(ids.member, async () => {
      const rows = await search(ids.member);
      for (const hidden of [ids.private, ids.other, ids.superseded]) assert.ok(!rows.some(row => row.id === hidden));
      assert.ok(rows.some(row => row.id === ids.replacement));
      assert.equal((await search(ids.lead)).length, 0);
    });
    await asUser(ids.stranger, async () => assert.equal((await search(ids.stranger)).length, 0));
    await q("update members set role='member' where user_id=$1 and dept_id=$2", [ids.lead, ids.dept]);
    await asUser(ids.lead, async () => assert.ok(!(await search(ids.lead)).some(row => row.id === ids.private)));
    assert.equal((await q("select has_function_privilege('anon','search_decisions_as(uuid,uuid,vector,text,integer,text)','EXECUTE') allowed")).rows[0].allowed, false);
    await assert.rejects(() => search(ids.member, "invalid"), error => error.code === "22023");
  });
  await check("answer storage: citation order is atomic, stable and unavailable to user completion calls", async () => {
    await q("insert into sources(id,dept_id,kind,external_id,active) values($1,$2,'document','grounding-qa',true)", [ids.source, ids.dept]);
    await q("insert into items(id,dept_id,source_id,content) values($1,$2,$3,'첫 문단.\n\n둘째 문단.')", [ids.item, ids.dept, ids.source]);
    await q("insert into items(id,dept_id,source_id,content) values($1,$2,$3,'둘째 문단.')", [ids.item2, ids.dept, ids.source]);
    await q("insert into answers(id,dept_id,asked_by,question,status) values($1,$2,$3,'검증 질문','pending')", [ids.answer, ids.dept, ids.member]);
    const citations = JSON.stringify([{ item_id: ids.item2, quote: "둘째 문단." }, { item_id: ids.item, quote: "첫 문단." }]);
    assert.equal((await q("select complete_answer($1,'[1] 둘째 문단.\n\n[2] 첫 문단.',false,null,$2::jsonb) ok", [ids.answer, citations])).rows[0].ok, true);
    const rows = (await q("select quote,ordinal from citations where owner_kind='answer' and owner_id=$1 order by ordinal", [ids.answer])).rows;
    assert.deepEqual(rows, [{ quote: "둘째 문단.", ordinal: 1 }, { quote: "첫 문단.", ordinal: 2 }]);
    assert.equal((await q("select complete_answer($1,'duplicate',false,null,$2::jsonb) ok", [ids.answer, citations])).rows[0].ok, false);
    assert.equal((await q("select has_function_privilege('authenticated','complete_answer(uuid,text,boolean,text,jsonb)','EXECUTE') allowed")).rows[0].allowed, false);
  });
}
