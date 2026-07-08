do $$
begin
  create type pending_redemption_status as enum ('pending', 'confirmed', 'cancelled', 'expired');
exception
  when duplicate_object then null;
end $$;

create table if not exists pending_redemptions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  source text not null default 'line',
  raw_message text not null,
  reply_text text not null,
  parsed_payload jsonb not null,
  status pending_redemption_status not null default 'pending',
  is_test boolean not null default false,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  notes text
);

create index if not exists idx_pending_redemptions_student_status
  on pending_redemptions(student_id, status, expires_at);

create index if not exists idx_pending_redemptions_test
  on pending_redemptions(is_test, created_at);
