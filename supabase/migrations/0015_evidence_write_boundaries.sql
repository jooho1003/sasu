-- 원문 생성(승인된 문서·회의 업로드)과 원문 변조 권한은 별개다.
-- service_role의 수집/삭제 동기화/워커 권한과 기존 SELECT RLS는 유지한다.
revoke update, delete on public.items, public.citations from anon, authenticated;
revoke insert, update, delete on public.classifications from anon, authenticated;
