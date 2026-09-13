-- ASK 일일 한도는 모든 입력 경로가 만나는 answers INSERT 경계에서 집행한다.
create index if not exists answers_asked_by_created_at_idx
  on public.answers (asked_by, created_at);

create or replace function public.enforce_ask_daily_limit()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_kst_day_start timestamptz;
begin
  -- 시드·게스트 준비 답변은 질문자 한도 대상이 아니다.
  if new.asked_by is null then return new; end if;

  v_kst_day_start := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  if (
    select count(*)
    from public.answers
    where asked_by = new.asked_by
      and created_at >= v_kst_day_start
      and created_at < v_kst_day_start + interval '1 day'
  ) >= 50 then
    raise exception 'ask_daily_limit' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists answers_ask_daily_limit on public.answers;
create trigger answers_ask_daily_limit
before insert on public.answers
for each row execute function public.enforce_ask_daily_limit();

-- 0014는 boolean을 반환했지만, 한도 초과는 이벤트 멱등 마커를 남긴 정상 종료다.
drop function if exists public.ingest_slack_atomic(text, uuid, text, text, text, text, timestamptz, text);
create function public.ingest_slack_atomic(
  p_event_id text, p_source_id uuid, p_author_ext_id text, p_kind text,
  p_content text, p_external_ref text, p_spoken_at timestamptz, p_thread_ts text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_event text;
  v_source public.sources%rowtype;
  v_member public.members%rowtype;
  v_id uuid;
begin
  if p_kind is null or p_kind not in ('item','answer') or nullif(btrim(p_event_id),'') is null
     or nullif(btrim(p_content),'') is null or nullif(btrim(p_author_ext_id),'') is null then
    raise exception using errcode='22023', message='invalid_ingest_payload';
  end if;

  select s.* into v_source from public.sources s
    join public.departments d on d.id=s.dept_id
    join public.orgs o on o.id=d.org_id
    where s.id=p_source_id and s.kind='slack_channel' and s.active=true and not o.is_demo
    for share of s;
  if not found then return jsonb_build_object('status', 'skipped'); end if;
  select * into v_member from public.members
    where dept_id=v_source.dept_id and slack_user_id=p_author_ext_id and consented_at is not null
    for share;
  if not found then return jsonb_build_object('status', 'skipped'); end if;

  insert into public.ingest_events(event_id) values(p_event_id)
    on conflict do nothing returning event_id into v_event;
  if v_event is null then return jsonb_build_object('status', 'duplicate'); end if;

  if p_kind='answer' then
    if length(p_content)<5 or length(p_content)>1000 or nullif(btrim(p_thread_ts),'') is null then
      raise exception using errcode='22023', message='invalid_answer_payload';
    end if;
    begin
      insert into public.answers(dept_id,asked_by,question,status)
        values(v_source.dept_id,v_member.user_id,p_content,'pending') returning id into v_id;
    exception when sqlstate 'P0001' then
      if sqlerrm = 'ask_daily_limit' then
        return jsonb_build_object('status', 'rate_limited');
      end if;
      raise;
    end;
    insert into public.jobs(kind,payload) values('answer',jsonb_build_object(
      'answerId',v_id,'slackReply',jsonb_build_object('channel',v_source.external_id,'threadTs',p_thread_ts)));
  else
    if nullif(btrim(p_external_ref),'') is null then
      raise exception using errcode='22023', message='invalid_item_payload';
    end if;
    insert into public.items(source_id,dept_id,external_ref,author_ext_id,author,spoken_at,content)
      values(v_source.id,v_source.dept_id,p_external_ref,p_author_ext_id,v_member.display_name,p_spoken_at,p_content)
      on conflict(source_id,external_ref) do nothing returning id into v_id;
    if v_id is null then
      select id into v_id from public.items where source_id=v_source.id and external_ref=p_external_ref and deleted_at is null;
    end if;
    if v_id is not null then
      insert into public.jobs(id,kind,payload)
        values(md5('sasu-slack-classify:' || v_id::text)::uuid,'classify',jsonb_build_object('itemId',v_id))
        on conflict(id) do nothing;
    end if;
  end if;
  return jsonb_build_object('status', 'saved');
end;
$$;

revoke all on function public.ingest_slack_atomic(text,uuid,text,text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.ingest_slack_atomic(text,uuid,text,text,text,text,timestamptz,text) to service_role;
