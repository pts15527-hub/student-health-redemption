alter table line_admin_contexts
  add column if not exists pending_action text,
  add column if not exists pending_payload jsonb;

create index if not exists idx_line_admin_contexts_pending_action
  on line_admin_contexts(pending_action)
  where pending_action is not null;
