import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
export async function verifyReviewedMaterialsSql({ q, check, asUser }) {
  const id = Object.fromEntries(
    [
      "org",
      "dept",
      "other",
      "lead",
      "member",
      "outsider",
      "review",
      "cancel",
    ].map((k) => [k, randomUUID()]),
  );
  await q("insert into orgs(id,name) values($1,'Review QA')", [id.org]);
  await q(
    "insert into departments(id,org_id,name) values($1,$3,'Review QA'),($2,$3,'Other QA')",
    [id.dept, id.other, id.org],
  );
  await q("insert into auth.users(id) values($1),($2),($3)", [
    id.lead,
    id.member,
    id.outsider,
  ]);
  await q(
    "insert into members(user_id,dept_id,role,display_name,consented_at) values($1,$4,'lead','검토자',now()),($2,$4,'member','멤버',null),($3,$5,'lead','다른 부서',now())",
    [id.lead, id.member, id.outsider, id.dept, id.other],
  );
  const input = (rid = id.review, extra = {}) =>
    JSON.stringify({
      id: rid,
      kind: "audio",
      title: "TTS 합성 음성",
      filename: "tts.wav",
      size: 2000,
      fingerprint: "a".repeat(64),
      duration: 90,
      visibility: "dept",
      participants: [],
      synthetic: true,
      consent_confirmed: true,
      ...extra,
    });
  const create = (rid = id.review, extra = {}) =>
    q("select create_review($1,$2::jsonb) id", [id.dept, input(rid, extra)]);
  const row = async () =>
    (await q("select * from reviewed_materials where id=$1", [id.review]))
      .rows[0];
  const edit = (revision, sections) =>
    q("select save_review($1,$2,$3,$4::jsonb) revision", [
      id.review,
      revision,
      "교정한 제목",
      JSON.stringify(sections),
    ]);
  await check(
    "reviews: member/cross-department/unconsented speech denied; repeat create is idempotent",
    async () => {
      await asUser(id.member, () =>
        assert.rejects(
          () => create(),
          (e) => e.code === "42501",
        ),
      );
      await asUser(id.outsider, () =>
        assert.rejects(
          () => create(),
          (e) => e.code === "42501",
        ),
      );
      await asUser(id.lead, () =>
        assert.rejects(
          () =>
            create(randomUUID(), {
              synthetic: false,
              participants: [id.member],
            }),
          (e) => e.code === "42501",
        ),
      );
      await asUser(id.lead, async () => {
        await create();
        await create();
      });
      assert.equal(
        (
          await q(
            "select count(*)::int n from review_parts where review_id=$1",
            [id.review],
          )
        ).rows[0].n,
        2,
      );
    },
  );
  await check(
    "reviews: drafts are not sources; private storage follows SQL permission",
    async () => {
      assert.equal(
        (
          await q(
            "select count(*)::int n from sources where external_id like $1",
            ["review:" + id.review + ":%"],
          )
        ).rows[0].n,
        0,
      );
      await asUser(id.member, async () => {
        assert.equal(
          (await q("select count(*)::int n from reviewed_materials")).rows[0].n,
          0,
        );
        assert.equal(
          (
            await q("select review_storage_allowed($1,false) ok", [
              id.dept + "/" + id.review + "/original",
            ])
          ).rows[0].ok,
          false,
        );
      });
      await asUser(id.lead, async () =>
        assert.equal(
          (
            await q("select review_storage_allowed($1,true) ok", [
              id.dept + "/" + id.review + "/original",
            ])
          ).rows[0].ok,
          true,
        ),
      );
      await asUser(id.lead, () =>
        assert.rejects(
          () => q("select publish_review($1,1)", [id.review]),
          (e) => e.code === "22023",
        ),
      );
    },
  );
  await check(
    "reviews: jobs contain identifiers only; final segment completes the full draft",
    async () => {
      for (let i = 0; i < 2; i++) {
        await asUser(id.lead, async () => {
          const first = await q("select queue_review_part($1,$2) id", [
            id.review,
            i,
          ]);
          const second = await q("select queue_review_part($1,$2) id", [
            id.review,
            i,
          ]);
          assert.equal(first.rows[0].id, second.rows[0].id);
        });
        const p = (
          await q(
            "select * from review_parts where review_id=$1 and part_index=$2",
            [id.review, i],
          )
        ).rows[0];
        const lease = randomUUID();
        assert.ok(
          (await q("select claim_review_part($1,1,$2) value", [p.id, lease]))
            .rows[0].value,
        );
        assert.equal(
          (
            await q("select claim_review_part($1,1,$2) value", [
              p.id,
              randomUUID(),
            ])
          ).rows[0].value,
          null,
        );
        const section = [
          {
            id: "part-" + i,
            text: i ? "마지막 문장" : "첫 문장",
            original_text: i ? "마지막 문장" : "첫 문장",
            origin: "transcribed",
            edited: false,
            location: null,
            start_seconds: i * 60,
            end_seconds: i ? 90 : 61,
          },
        ];
        assert.equal(
          (
            await q("select finish_review_part($1,$2,$3::jsonb,null) ok", [
              p.id,
              lease,
              JSON.stringify(section),
            ])
          ).rows[0].ok,
          true,
        );
      }
      assert.equal((await row()).sections.length, 2);
      assert.equal((await row()).status, "ready");
      const payloads = (
        await q("select payload from jobs where kind='process_review'")
      ).rows;
      assert.ok(
        payloads.every(
          (r) => Object.keys(r.payload).sort().join(",") === "attempt,partId",
        ),
      );
    },
  );
  await check(
    "reviews: edits mask text, retain genuine provenance, reject duplicate IDs and stale saves",
    async () => {
      await asUser(id.lead, () =>
        edit(1, [
          {
            id: "part-0",
            text: "교정 qa@example.com",
            origin: "user",
            original_text: "위조",
          },
          { id: "new", text: "메모" },
        ]),
      );
      const r = await row();
      assert.equal(r.revision, 2);
      assert.equal(r.sections[0].text, "교정 [이메일]");
      assert.equal(r.sections[0].original_text, "첫 문장");
      assert.equal(r.sections[1].origin, "user");
      await asUser(id.lead, () =>
        assert.rejects(
          () => edit(1, []),
          (e) => e.code === "40001",
        ),
      );
      await asUser(id.lead, () =>
        assert.rejects(
          () =>
            edit(2, [
              { id: "x", text: "a" },
              { id: "x", text: "b" },
            ]),
          (e) => e.code === "22023",
        ),
      );
    },
  );
  let published;
  await check(
    "reviews: publication is atomic/idempotent and repeated edits revoke prior evidence",
    async () => {
      await asUser(id.lead, async () => {
        published = (await q("select publish_review($1,2) id", [id.review]))
          .rows[0].id;
        assert.equal(
          (await q("select publish_review($1,2) id", [id.review])).rows[0].id,
          published,
        );
      });
      assert.equal(
        (
          await q("select count(*)::int n from items where source_id=$1", [
            published,
          ])
        ).rows[0].n,
        2,
      );
      await asUser(id.lead, () =>
        edit(2, [{ id: "part-0", text: "다시 교정" }]),
      );
      await asUser(id.lead, () =>
        q("select publish_review($1,3)", [id.review]),
      );
      assert.ok(
        (
          await q("select content,deleted_at from items where source_id=$1", [
            published,
          ])
        ).rows.every((i) => i.content === "" && i.deleted_at),
      );
    },
  );
  await check("reviews: inactive source clears summaries and fences late completion/direct reads", async()=>{
    // The preceding publication test superseded this source.
    await q("update document_summaries set summary='{\"overview\":\"late stale content\"}',status='summarized' where source_id=$1",[published]);
    const summary=(await q('select summary,status_reason from document_summaries where source_id=$1',[published])).rows[0];
    assert.equal(summary.summary,null);assert.equal(summary.status_reason,'source_removed');
    await asUser(id.lead,async()=>assert.equal((await q('select count(*)::int n from document_summaries where source_id=$1',[published])).rows[0].n,0));
  });
  await check(
    "reviews: stop clears current searchable text; originals remain until requested deletion",
    async () => {
      await asUser(id.lead, () =>
        q("select review_action($1,3,'stop')", [id.review]),
      );
      assert.equal((await row()).published_source_id, null);
      await asUser(id.lead, () =>
        q("select review_action($1,3,'delete_original')", [id.review]),
      );
      assert.ok((await row()).original_deleted_at);
      assert.equal((await row()).sections.length, 1);
      await asUser(id.lead, async () =>
        assert.equal(
          (
            await q("select review_storage_allowed($1,false) ok", [
              id.dept + "/" + id.review + "/original",
            ])
          ).rows[0].ok,
          false,
        ),
      );
      assert.equal(
        (
          await q(
            "select count(*)::int n from jobs where kind='purge_review_files' and payload->>'reviewId'=$1",
            [id.review],
          )
        ).rows[0].n,
        1,
      );
    },
  );
  await check(
    "reviews: cancellation blocks late results; delete clears drafts and revision copies",
    async () => {
      await asUser(id.lead, () => create(id.cancel));
      await asUser(id.lead, () =>
        q("select queue_review_part($1,0)", [id.cancel]),
      );
      const p = (
        await q(
          "select id from review_parts where review_id=$1 and part_index=0",
          [id.cancel],
        )
      ).rows[0].id;
      const lease = randomUUID();
      await q("select claim_review_part($1,1,$2)", [p, lease]);
      await asUser(id.lead, () =>
        q("select review_action($1,1,'cancel')", [id.cancel]),
      );
      assert.equal(
        (
          await q("select finish_review_part($1,$2,'[]'::jsonb,null) ok", [
            p,
            lease,
          ])
        ).rows[0].ok,
        false,
      );
      await asUser(id.lead, () =>
        q("select review_action($1,3,'delete')", [id.review]),
      );
      assert.equal((await row()).sections.length, 0);
      assert.ok((await row()).deleted_at);
      assert.equal(
        (
          await q(
            "select count(*)::int n from review_revisions where review_id=$1",
            [id.review],
          )
        ).rows[0].n,
        0,
      );
    },
  );
  await check(
    "reviews: users cannot forge rows or invoke worker completion",
    async () => {
      await asUser(id.lead, () =>
        assert.rejects(
          () =>
            q("update reviewed_materials set status='ready' where id=$1", [
              id.cancel,
            ]),
          (e) => e.code === "42501",
        ),
      );
      await asUser(id.lead, () =>
        assert.rejects(
          () => q("select sweep_review_parts()"),
          (e) => e.code === "42501",
        ),
      );
      for (const role of ["anon", "authenticated"])
        for (const name of [
          "claim_review_part",
          "finish_review_part",
          "sweep_review_parts",
        ])
          assert.equal(
            (
              await q(
                "select has_function_privilege($1,p.oid,'EXECUTE') ok from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$2",
                [role, name],
              )
            ).rows[0].ok,
            false,
          );
    },
  );
  await check(
    "reviews: direct RPC masking, demo rejection, and participant withdrawal purge",
    async () => {
      assert.equal(
        (
          await q(
            "select mask_review_text('계좌 123456789012 / 123-456-789012 / +82 10 1234 5678 / 2026-09-16') t",
          )
        ).rows[0].t,
        "계좌 [계좌번호] / [계좌번호] / [전화번호] / 2026-09-16",
      );
      await q("update orgs set is_demo=true where id=$1", [id.org]);
      await asUser(id.lead, () =>
        assert.rejects(
          () => create(randomUUID()),
          (e) => e.code === "42501",
        ),
      );
      await q("update orgs set is_demo=false where id=$1", [id.org]);
      await q("update members set consented_at=now() where user_id=$1", [
        id.member,
      ]);
      const rid = randomUUID();
      await asUser(id.lead, () =>
        create(rid, {
          duration: 1,
          synthetic: false,
          participants: [id.member],
        }),
      );
      await q(
        "update reviewed_materials set status='ready',sections=$2::jsonb where id=$1",
        [
          rid,
          JSON.stringify([
            {
              id: "speech",
              text: "동의한 합성 테스트 발언",
              original_text: "동의한 합성 테스트 발언",
              origin: "transcribed",
              edited: false,
              location: null,
              start_seconds: 0,
              end_seconds: 1,
            },
          ]),
        ],
      );
      await q("update review_parts set status='done' where review_id=$1", [
        rid,
      ]);
      let sid;
      await asUser(id.lead, async () => {
        sid = (await q("select publish_review($1,1) id", [rid])).rows[0].id;
      });
      await q("update members set consented_at=null where user_id=$1", [
        id.member,
      ]);
      const removed = (
        await q("select * from reviewed_materials where id=$1", [rid])
      ).rows[0];
      assert.ok(removed.deleted_at);
      assert.ok(removed.original_deleted_at);
      assert.deepEqual(removed.sections, []);
      assert.ok(
        (
          await q("select deleted_at,content from items where source_id=$1", [
            sid,
          ])
        ).rows.every((i) => i.deleted_at && i.content === ""),
      );
      await asUser(id.lead, async () =>
        assert.equal(
          (
            await q("select review_storage_allowed($1,false) ok", [
              id.dept + "/" + rid + "/original",
            ])
          ).rows[0].ok,
          false,
        ),
      );
    },
  );
  await check(
    "retention: only current consenting records in the caller department are exported",
    async () => {
      const source = randomUUID();
      await q(
        "update members set slack_user_id='U_REVIEW_QA' where user_id=$1",
        [id.lead],
      );
      await q(
        "insert into sources(id,dept_id,kind,external_id,title) values($1,$2,'slack_channel','C_REVIEW_QA','보존 합성 채널')",
        [source, id.dept],
      );
      await q(
        "insert into items(source_id,dept_id,author_ext_id,content,spoken_at) values($1,$2,'U_REVIEW_QA','보존할 합성 기록','2026-09-16T00:00:00Z'),($1,$2,'U_REVIEW_QA','지울 합성 기록','2026-09-16T01:00:00Z')",
        [source, id.dept],
      );
      await q(
        "update items set deleted_at=now() where source_id=$1 and content='지울 합성 기록'",
        [source],
      );
      await asUser(id.lead, async () => {
        await q("select set_retention_settings($1,'free',null,90)", [id.dept]);
        const rows = (
          await q(
            "select retention_records($1,'2026-09-01','2026-09-17') result",
            [source],
          )
        ).rows[0].result;
        assert.equal(rows.length, 1);
        assert.equal(rows[0].content, "보존할 합성 기록");
        assert.equal(
          (await q("select retention_overview($1) result", [id.dept])).rows[0]
            .result.settings.retention_days,
          90,
        );
      });
      await asUser(id.member, () =>
        assert.rejects(
          () =>
            q("select retention_records($1,'2026-09-01','2026-09-17')", [
              source,
            ]),
          (e) => e.code === "42501",
        ),
      );
      await asUser(id.outsider, () =>
        assert.rejects(
          () => q("select retention_overview($1)", [id.dept]),
          (e) => e.code === "42501",
        ),
      );
      await q("update members set consented_at=null where user_id=$1", [
        id.lead,
      ]);
      await asUser(id.lead, () =>
        assert.rejects(
          () =>
            q("select retention_records($1,'2026-09-01','2026-09-17')", [
              source,
            ]),
          (e) => e.code === "42501",
        ),
      );
      await q("update members set consented_at=now() where user_id=$1", [
        id.lead,
      ]);
    },
  );
}
