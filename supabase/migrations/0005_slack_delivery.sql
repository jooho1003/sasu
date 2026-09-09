alter table public.decision_requests
  add column if not exists slack_delivery_status text not null default 'pending',
  add column if not exists slack_delivery_error text,
  add column if not exists slack_channel_id text,
  add column if not exists slack_message_ts text;

alter table public.decision_requests
  add constraint decision_requests_slack_delivery_status_check
  check (slack_delivery_status in ('pending', 'sent', 'failed', 'skipped'));

create index if not exists decision_requests_slack_delivery_idx
  on public.decision_requests (slack_delivery_status)
  where status = 'open';
