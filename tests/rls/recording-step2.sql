-- Run only against a disposable, seeded local Supabase DB:
-- Get-Content -Raw tests/rls/recording-step2.sql | docker exec -i supabase_db_sasu psql -U postgres -d postgres -X -q -t -A
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.org_settings(org_id,browser_recording_enabled)
VALUES('11111111-1111-4111-8111-111111111111',true)
ON CONFLICT(org_id) DO UPDATE SET browser_recording_enabled=true;
SELECT set_config('request.jwt.claim.sub',(
  SELECT user_id::text FROM public.members
  WHERE dept_id='22222222-2222-4222-8222-222222222222' AND role='lead' LIMIT 1),true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE first_id uuid := '90111111-1111-4111-8111-111111111111';
  second_id uuid := '90222222-2222-4222-8222-222222222222';
  dept uuid := '22222222-2222-4222-8222-222222222222';
  first_input jsonb; second_input jsonb; manifest jsonb; capture jsonb; result jsonb; meta jsonb;
BEGIN
  first_input:=jsonb_build_object('id',first_id,'title','검증 원본','input_method','microphone',
    'visibility','leads_only','meeting_provider','in_person','participants',jsonb_build_array(auth.uid()),
    'consent_confirmed',true);
  second_input:=first_input||jsonb_build_object('id',second_id,'title','검증 후속',
    'continues_recording_id',first_id);
  PERFORM public.start_review_recording(dept,first_input,1);
  PERFORM public.start_continued_review_recording(dept,second_input,1);
  IF (SELECT continues_recording_id FROM public.review_recordings WHERE id=second_id)
    IS DISTINCT FROM first_id THEN RAISE EXCEPTION 'continuation stamp missing'; END IF;
  manifest:=jsonb_build_object('version',1,'segments',jsonb_build_array(jsonb_build_object(
    'index',0,'sample_count',16000,'bytes',32044,'sha256',repeat('a',64))));
  capture:=jsonb_build_object('captured_samples',16000,'paused',false,'interrupted',false,
    'levels',jsonb_build_object('microphone','AQ==','system',null),'clipping_ratio',0.06,
    'health',jsonb_build_object('checkpoint_delays',0,'max_pending_samples',32,
      'backlog_stops',0,'max_sample_wall_gap_ms',250,'microphone_reselects',1));
  result:=public.create_review_recording_with_profile(dept,second_id,manifest,capture);
  IF result->>'state'<>'saving' THEN RAISE EXCEPTION 'save did not enter saving'; END IF;
  SELECT capture_metadata INTO meta FROM public.reviewed_materials WHERE id=second_id;
  IF meta#>>'{meeting,provider}'<>'in_person' OR meta#>>'{meeting,title}'<>'검증 후속' OR
    meta->>'continues_review_id'<>first_id::text OR meta#>>'{levels,microphone}'<>'AQ==' OR
    (meta->>'clipping_ratio')::numeric<>0.06 OR (meta#>>'{health,max_pending_samples}')::integer<>32
    THEN RAISE EXCEPTION 'capture metadata missing'; END IF;
  PERFORM public.create_review_recording_with_profile(dept,second_id,manifest,capture);
  BEGIN
    PERFORM public.create_review_recording_with_profile(dept,second_id,manifest,
      capture||jsonb_build_object('clipping_ratio',0.07));
    RAISE EXCEPTION 'mismatched retry accepted';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
  END;
  BEGIN
    PERFORM public.create_review_recording_with_profile(dept,first_id,manifest,'{}'::jsonb);
    RAISE EXCEPTION 'invalid profile accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  RAISE NOTICE 'recording step2 SQL checks passed';
END $$;
RESET ROLE;
UPDATE public.org_settings SET browser_recording_enabled=false
WHERE org_id='11111111-1111-4111-8111-111111111111';
SET LOCAL ROLE authenticated;
DO $$
DECLARE dept uuid := '22222222-2222-4222-8222-222222222222';
  previous_id uuid := '90111111-1111-4111-8111-111111111111';
  input jsonb;
BEGIN
  input:=jsonb_build_object('id','90333333-3333-4333-8333-333333333333','title','차단 확인',
    'input_method','microphone','visibility','leads_only','meeting_provider','in_person',
    'participants',jsonb_build_array(auth.uid()),'consent_confirmed',true);
  BEGIN
    PERFORM public.start_review_recording(dept,input,1);
    RAISE EXCEPTION 'disabled recording started';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.recording_key_context(dept,previous_id);
    RAISE EXCEPTION 'disabled recording key issued';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF NOT EXISTS(SELECT 1 FROM public.reviewed_materials WHERE id='90222222-2222-4222-8222-222222222222') THEN
    RAISE EXCEPTION 'existing review hidden by switch';
  END IF;
  RAISE NOTICE 'disabled switch checks passed';
END $$;
ROLLBACK;
