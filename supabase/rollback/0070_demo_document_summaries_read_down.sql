-- Local/manual rollback only; removes the anonymous demo read path added by 0070.
drop policy if exists document_summaries_demo_read on public.document_summaries;
