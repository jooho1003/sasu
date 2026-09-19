-- Destructive rollback: only after an explicit environment approval and backup.
do $$ declare f record; begin
for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname=any(array['mask_retro_text','retro_owner','retro_activity_live','retro_revision_live','retro_can_read','retro_revision_read','retro_activity_read','retro_validate','queue_retro','create_retro_day','save_retro','confirm_retro','set_retro_visibility','exclude_retro_activity','regenerate_retro','delete_retro_day','retro_timeline','claim_retro_draft','finish_retro_draft','sweep_retro_drafts']) loop
  execute format('drop function %s cascade',f.signature);
end loop; end $$;
drop table public.retro_exports;
drop table public.retro_revisions;
drop table public.retro_activities;
drop table public.retro_days;
