create table if not exists student_aliases (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  alias_key text not null unique,
  alias_display text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_student_aliases_student
  on student_aliases(student_id);

create table if not exists line_admin_contexts (
  admin_user_id text primary key,
  active_student_id uuid not null references students(id) on delete cascade,
  selected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_line_admin_contexts_student
  on line_admin_contexts(active_student_id);

alter table student_aliases enable row level security;
alter table line_admin_contexts enable row level security;

insert into student_aliases (student_id, alias_key, alias_display)
select id, '裔甯', '裔甯'
from students
where share_token = 'yi-ning'
on conflict (alias_key) do update set
  student_id = excluded.student_id,
  alias_display = excluded.alias_display;

insert into student_aliases (student_id, alias_key, alias_display)
select id, '邱裔甯', '邱裔甯'
from students
where share_token = 'yi-ning'
on conflict (alias_key) do update set
  student_id = excluded.student_id,
  alias_display = excluded.alias_display;
