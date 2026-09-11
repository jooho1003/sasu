-- 문서 업로드 결과는 원문 chunk(items)와 요약 상태를 분리해 추적한다.
create table document_summaries (
  source_id uuid primary key references sources on delete cascade,
  dept_id uuid references departments not null,
  status text not null default 'processing', -- processing|summarized|summary_failed
  summary jsonb,
  status_reason text,
  extracted_chars int not null default 0,
  chunk_count int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table document_summaries enable row level security;

create policy document_summaries_visible_access
on document_summaries
for all
to authenticated
using (
  exists (
    select 1
    from public.sources as source
    where source.id = document_summaries.source_id
      and source.dept_id = document_summaries.dept_id
      and can_see(auth.uid(), source.dept_id, source.visibility)
  )
)
with check (
  exists (
    select 1
    from public.sources as source
    where source.id = document_summaries.source_id
      and source.dept_id = document_summaries.dept_id
      and can_see(auth.uid(), source.dept_id, source.visibility)
  )
);
