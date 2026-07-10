create extension if not exists "pgcrypto";

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  share_token text not null unique,
  name text not null,
  project_name text not null,
  notes text,
  risk_notes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists student_aliases (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  alias_key text not null unique,
  alias_display text not null,
  created_at timestamptz not null default now()
);

create table if not exists line_admin_contexts (
  admin_user_id text primary key,
  active_student_id uuid not null references students(id) on delete cascade,
  pending_action text,
  pending_payload jsonb,
  selected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists course_contracts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  plan_name text not null,
  total_sessions integer not null check (total_sessions >= 0),
  start_date date not null,
  duration_months integer not null,
  buffer_months integer not null default 0,
  location text,
  service_items text[] not null default '{}',
  cancellation_policy text,
  pregnancy_policy text,
  notes text,
  created_at timestamptz not null default now()
);

do $$
begin
  create type class_session_status as enum ('scheduled', 'completed', 'cancelled');
exception
  when duplicate_object then null;
end $$;

create table if not exists class_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  session_date date not null,
  session_time time,
  title text not null,
  status class_session_status not null,
  content text,
  notes text,
  counts_toward_used_sessions boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists billing_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  total_amount integer not null check (total_amount >= 0),
  installment_count integer not null check (installment_count > 0),
  amount_per_installment integer not null check (amount_per_installment >= 0),
  due_day_of_month integer not null check (due_day_of_month between 1 and 31),
  start_date date not null,
  notes text,
  created_at timestamptz not null default now()
);

do $$
begin
  create type payment_status as enum ('unpaid', 'paid', 'late', 'waived');
exception
  when duplicate_object then null;
end $$;

create table if not exists payment_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  billing_plan_id uuid references billing_plans(id) on delete set null,
  installment_no integer not null check (installment_no > 0),
  due_date date not null,
  paid_date date,
  amount integer not null check (amount >= 0),
  status payment_status not null default 'unpaid',
  method text,
  notes text,
  created_at timestamptz not null default now(),
  unique (student_id, installment_no)
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category text not null,
  specification text not null,
  primary_benefits text not null,
  product_line text,
  image_src text,
  image_alt text,
  image_aliases text[] not null default '{}',
  is_available boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  label text not null,
  flavor text,
  package_type text,
  image_src text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists package_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  plan_name text not null,
  total_credits numeric(8, 2) not null check (total_credits >= 0),
  credit_unit_label text not null default '組',
  start_date date,
  notes text,
  created_at timestamptz not null default now()
);

do $$
begin
  create type redemption_rule_mode as enum ('fixed_quantity', 'mix_and_match', 'single_item');
exception
  when duplicate_object then null;
end $$;

create table if not exists redemption_rules (
  id uuid primary key default gen_random_uuid(),
  package_plan_id uuid not null references package_plans(id) on delete cascade,
  label text not null,
  mode redemption_rule_mode not null,
  credit_cost numeric(8, 2) not null check (credit_cost >= 0),
  quantity_per_redemption integer not null check (quantity_per_redemption > 0),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists redemption_rule_products (
  redemption_rule_id uuid not null references redemption_rules(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  primary key (redemption_rule_id, product_id)
);

create table if not exists redemption_bundles (
  id uuid primary key default gen_random_uuid(),
  package_plan_id uuid not null references package_plans(id) on delete cascade,
  label text not null,
  credit_cost numeric(8, 2) not null check (credit_cost >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists redemption_bundle_items (
  id uuid primary key default gen_random_uuid(),
  redemption_bundle_id uuid not null references redemption_bundles(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  item_name text not null,
  quantity integer not null check (quantity > 0),
  is_bonus boolean not null default false,
  notes text
);

do $$
begin
  create type redemption_source_type as enum ('rule', 'bundle', 'promotion', 'manual');
exception
  when duplicate_object then null;
end $$;

create table if not exists redemption_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  package_plan_id uuid references package_plans(id) on delete set null,
  record_date date not null,
  source_type redemption_source_type not null default 'manual',
  source_id uuid,
  credit_used numeric(8, 2) not null check (credit_used >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists redemption_record_items (
  id uuid primary key default gen_random_uuid(),
  redemption_record_id uuid not null references redemption_records(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  item_name text not null,
  quantity integer not null check (quantity > 0),
  notes text
);

create table if not exists redemption_record_bonus_items (
  id uuid primary key default gen_random_uuid(),
  redemption_record_id uuid not null references redemption_records(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  item_name text not null,
  quantity integer not null check (quantity > 0),
  notes text
);

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

create index if not exists idx_students_share_token on students(share_token);
create index if not exists idx_student_aliases_student on student_aliases(student_id);
create index if not exists idx_line_admin_contexts_student on line_admin_contexts(active_student_id);
create index if not exists idx_class_sessions_student_date on class_sessions(student_id, session_date);
create index if not exists idx_payment_records_student_due on payment_records(student_id, due_date);
create index if not exists idx_redemption_records_student_date on redemption_records(student_id, record_date);
create index if not exists idx_products_category on products(category);
create index if not exists idx_pending_redemptions_student_status on pending_redemptions(student_id, status, expires_at);
create index if not exists idx_pending_redemptions_test on pending_redemptions(is_test, created_at);

alter table student_aliases enable row level security;
alter table line_admin_contexts enable row level security;

-- Minimal test seed.
insert into students (share_token, name, project_name, risk_notes)
values (
  'yi-ning',
  '邱裔甯',
  '產後修復與代謝優化',
  array['若有頭暈、心悸、體力不支、瘦瘦針反應或貧血相關狀況，需於訓練前主動告知。']
)
on conflict (share_token) do nothing;

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

insert into course_contracts (student_id, plan_name, total_sessions, start_date, duration_months, buffer_months, service_items, cancellation_policy)
select id, '產後修復運動矯正與營養監測計畫', 72, '2026-06-20', 15, 3,
  array['運動矯正訓練', '筋膜調理', '醫動對接監測', '營養諮詢'],
  '課前 24 小時告知。'
from students
where share_token = 'yi-ning'
and not exists (select 1 from course_contracts where student_id = students.id);

insert into billing_plans (student_id, total_amount, installment_count, amount_per_installment, due_day_of_month, start_date)
select id, 96000, 6, 16000, 20, '2026-06-20'
from students
where share_token = 'yi-ning'
and not exists (select 1 from billing_plans where student_id = students.id);

insert into payment_records (student_id, billing_plan_id, installment_no, due_date, amount, status)
select s.id, b.id, n, ('2026-06-20'::date + ((n - 1) * interval '1 month'))::date, 16000, 'unpaid'
from students s
join billing_plans b on b.student_id = s.id
cross join generate_series(1, 6) as n
where s.share_token = 'yi-ning'
on conflict (student_id, installment_no) do nothing;

insert into package_plans (student_id, plan_name, total_credits, credit_unit_label, start_date)
select id, '裔甯保健食品配置', 22, '組', '2026-06-20'
from students
where share_token = 'yi-ning'
and not exists (select 1 from package_plans where student_id = students.id);

insert into products (slug, name, category, specification, primary_benefits, image_src, image_alt)
values
('youthfountain-delete', 'YouthFountain 青春源-汰淨 Delete', '高端抗老', '90 錠 / 瓶', '清除老廢細胞、抗氧化、幫助代謝與健康維持', '/products/D.jpg', '青春源汰淨產品圖'),
('youthfountain-reborn', 'YouthFountain 青春源-煥活 Reborn', '高端抗老', '90 錠 / 瓶', '細胞修復、活化體力、抗老保養', '/products/R.jpg', '青春源煥活產品圖'),
('youthfountain-protect', 'YouthFountain 青春源-倍護 Protect', '高端抗老', '90 錠 / 瓶', '免疫防護、抗氧化、維持健康防線', '/products/P.jpg', '青春源倍護產品圖'),
('beauty-revitalizing-drink', '科技燕窩美妍賦活飲', '美容保養', '10 包 / 盒，每包 30ml；另有 7 包 / 盒，每包 25ml', '美顏保養、膠原補充、氣色與肌膚水潤', '/products/美妍賦活飲.jpg', '美妍賦活飲產品圖'),
('all-in-one-drink', '科技燕窩全能飲', '營養補充', '50ml / 包，8 包 / 盒', '美妍活力、防護升級、思緒清晰', '/products/全能飲.jpg', '科技燕窩全能飲產品圖'),
('smart-light-drink', '智明靈光飲', '眼 / 腦保養', '7 包 / 盒，每包 25ml；另有 10 包 / 盒，每包 30ml', '專注力、記憶力、眼睛保健、思緒清晰', '/products/靈光飲.jpg', '智明靈光飲產品圖'),
('polysaccharide-drink', '活力多醣飲', '健康機能', '7 包 / 盒，每包 25ml', '免疫力、呼吸道保養、元氣補充', '/products/多醣飲.jpg', '活力多醣飲產品圖'),
('magic-so-burning-body', 'Magic So 動動爆燃', '纖體瘦身', '錠劑，60 錠 / 盒', '運動燃燒、體力補充、代謝效率', '/products/動動爆燃.jpg', '動動爆燃產品圖'),
('magic-so-3-8', 'Magic So 黃金比例 3:8', '纖體瘦身', '膠囊，60 粒 / 盒', '餐前體態管理、降低食慾、脂肪代謝', '/products/黃金比例3比8.jpg', 'Magic So 黃金比例 3:8 產品圖'),
('magic-so-oil-cut', 'Magic So 閃澱油切', '纖體瘦身', '膠囊，60 粒 / 盒', '油脂吸附、降低澱粉吸收、飯後負擔管理', '/products/閃電油切.jpg', 'Magic So 閃澱油切產品圖'),
('magic-so-beauty-jelly', 'Magic So 美妍纖姿凍', '纖體瘦身', '果凍，10 包 / 盒', '排空清暢、降低熱量吸收、餐前急救', '/products/美妍纖姿凍.jpg', 'Magic So 美妍纖姿凍產品圖'),
('doubles-cocoa', 'DoubleS 科技營養餐 經典濃醇可可', '營養補充', '每包 35g，10 包 / 盒', '輕卡路里代餐、每份 15g 蛋白質、飽足感、熱量控制', '/products/可可蛋白粉.jpg', 'DoubleS 可可蛋白粉產品圖'),
('doubles-seafood-soup', 'DoubleS 科技營養餐 日式海鮮濃湯', '營養補充', '每包 35g，10 包 / 盒', '輕卡路里代餐、每份 15g 蛋白質、飽足感、鹹口味替代餐', '/products/海鮮濃湯蛋白粉.jpg', 'DoubleS 海鮮濃湯蛋白粉產品圖'),
('joint-steady-ex', '膠原關鍵穩 EX', '骨關節保養', '膠囊，30 粒 / 盒', '關節保養、軟骨修護、減緩磨損', '/products/關節穩.jpg', '膠原關鍵穩 EX 產品圖'),
('turtle-deer-joint-drink', '龜鹿膠原關鍵飲', '骨關節保養', '飲品，每包 25ml，7 包 / 盒', '關節保養、行動力、筋骨支持', '/products/龜鹿飲.jpg', '龜鹿膠原關鍵飲產品圖'),
('aurora-white-ex', '極光白賦美 EX', '美容保養', '錠劑，90 錠 / 瓶', '美白、淡斑、抗氧化、肌膚透亮', '/products/白賦美.jpg', '極光白賦美 EX 產品圖'),
('cranberry-private-care', '蔓越莓私密對策', '男女專屬', '粉包，30 包 / 盒', '女性私密保養、舒緩異味、維持菌叢平衡', '/products/私密對策.jpg', '蔓越莓私密對策產品圖'),
('sleep-care-ex', '艾立眠 EX', '健康機能', '膠囊，30 粒 / 盒', '睡眠品質、放鬆、精神恢復', '/products/艾立眠.jpg', '艾立眠 EX 產品圖'),
('red-yeast-circulation-ex', '紅麴活力循 EX', '心血管 / 循環系統保養', '膠囊，30 粒 / 盒', '心血管循環、血脂血壓管理', '/products/活力循(顆粒).jpg', '紅麴活力循 EX 產品圖'),
('natto-red-yeast-q10', '納豆紅麴 Q10 複方', '心血管 / 循環系統保養', '膠囊，60 粒 / 盒', '血脂、血壓、循環代謝保養', '/products/Q10.jpg', '納豆紅麴 Q10 複方產品圖'),
('premium-fish-oil', '頂級高濃度魚油', '心血管 / 循環系統保養', '軟膠囊，60 粒 / 瓶', 'Omega-3 補充、腦部、視力、心血管保養', '/products/魚油(罐裝).jpg', '頂級高濃度魚油產品圖'),
('plant-dha-algae-oil', '法國 DHA 植物藻油', '心血管 / 循環系統保養', '植物膠囊，30 粒 / 盒', 'DHA 補充、記憶力、學習力、視覺功能', '/products/植物魚油.jpg', '法國 DHA 植物藻油產品圖'),
('lutein-crystal', '超易視晶彩葉黃素', '眼 / 腦保養', '膠囊，30 粒 / 盒', '眼睛保健、黃斑部保養、視覺疲勞', '/products/葉黃素.jpg', '超易視晶彩葉黃素產品圖'),
('multi-strain-probiotics-ex', '多采益生菌 EX', '益生菌', '粉包，30 包 / 盒', '腸道菌叢、排便順暢、消化機能', '/products/多采益生菌.jpg', '多采益生菌產品圖'),
('sensitive-probiotics', '艾康敏益生菌', '益生菌', '膠囊，30 粒 / 盒', '過敏體質調整、免疫平衡、呼吸道保養', '/products/艾康敏益生菌.jpg', '艾康敏益生菌產品圖'),
('grow-up-drink', '樂高成長飲', '營養補充', '飲品，每包 25ml，7 包 / 盒', '兒童成長、骨骼發育、營養補充', '/products/樂高成長飲.jpg', '樂高成長飲產品圖'),
('liver-care-ex', '小心甘 EX', '健康機能', '膠囊，30 粒 / 盒', '肝臟保養、疲勞恢復、代謝排毒', '/products/小心甘.jpg', '小心甘 EX 產品圖'),
('maca-vitality-ex', '馬卡活力久 EX', '男女專屬', '膠囊，30 粒 / 盒', '男性活力、體力、耐力與精神', '/products/馬卡.jpg', '馬卡活力久 EX 產品圖'),
('clean-circulation-drink', '清醇活循飲', '心血管 / 循環系統保養', '飲品，10 包 / 盒，每包 30ml', '三高保養、循環代謝、油脂代謝', '/products/活循飲(液態).jpg', '清醇活循飲產品圖'),
('prostate-care-ex', '攝護力 EX', '男女專屬', '膠囊，60 粒 / 盒', '男性攝護腺保養、泌尿順暢', '/products/攝護力.jpg', '攝護力 EX 產品圖'),
('shelening', '衛樂寧', '健康機能', '0.5 公克 / 粒，60 粒 / 盒', '消化道保養、維持黏膜健康、餐後消化與代謝支持', '/products/衛樂寧.jpg', '衛樂寧產品圖'),
('b-complex-ex', '活力 BB EX', '增強體力 / 能量充沛', '錠劑，90 粒 / 盒', 'B 群補充、精神體力、代謝與氣色', '/products/B群.jpg', '活力 BB EX 產品圖'),
('calcium-magnesium-zinc-ex', '鈣鎂鋅 EX', '營養補充', '錠劑，90 粒 / 盒', '骨骼牙齒、鈣鎂鋅補充、睡眠與免疫支持', '/products/鈣鎂鋅.jpg', '鈣鎂鋅 EX 產品圖')
on conflict (slug) do update set
  name = excluded.name,
  category = excluded.category,
  specification = excluded.specification,
  primary_benefits = excluded.primary_benefits,
  image_src = excluded.image_src,
  image_alt = excluded.image_alt;

insert into redemption_rules (package_plan_id, label, mode, credit_cost, quantity_per_redemption, notes)
select p.id, '5 盒一組', 'fixed_quantity', 1, 5, '一般固定兌換規則'
from package_plans p
join students s on s.id = p.student_id
where s.share_token = 'yi-ning'
and not exists (select 1 from redemption_rules where package_plan_id = p.id and label = '5 盒一組');

insert into redemption_rules (package_plan_id, label, mode, credit_cost, quantity_per_redemption, notes)
select p.id, '1 盒一組', 'single_item', 1, 1, '青春源系列單盒兌換規則'
from package_plans p
join students s on s.id = p.student_id
where s.share_token = 'yi-ning'
and not exists (select 1 from redemption_rules where package_plan_id = p.id and label = '1 盒一組');

insert into redemption_rules (package_plan_id, label, mode, credit_cost, quantity_per_redemption, notes)
select p.id, '6 盒一組', 'fixed_quantity', 1, 6, '一般固定兌換規則'
from package_plans p
join students s on s.id = p.student_id
where s.share_token = 'yi-ning'
and not exists (select 1 from redemption_rules where package_plan_id = p.id and label = '6 盒一組');

insert into redemption_rules (package_plan_id, label, mode, credit_cost, quantity_per_redemption, notes)
select p.id, '8 盒一組', 'fixed_quantity', 1, 8, '一般固定兌換規則'
from package_plans p
join students s on s.id = p.student_id
where s.share_token = 'yi-ning'
and not exists (select 1 from redemption_rules where package_plan_id = p.id and label = '8 盒一組');

insert into redemption_rules (package_plan_id, label, mode, credit_cost, quantity_per_redemption, notes)
select p.id, '7 盒一組', 'fixed_quantity', 1, 7, '一般固定兌換規則'
from package_plans p
join students s on s.id = p.student_id
where s.share_token = 'yi-ning'
and not exists (select 1 from redemption_rules where package_plan_id = p.id and label = '7 盒一組');

insert into redemption_rules (package_plan_id, label, mode, credit_cost, quantity_per_redemption, notes)
select p.id, '3 盒一組', 'fixed_quantity', 1, 3, '一般固定兌換規則'
from package_plans p
join students s on s.id = p.student_id
where s.share_token = 'yi-ning'
and not exists (select 1 from redemption_rules where package_plan_id = p.id and label = '3 盒一組');

insert into redemption_rules (package_plan_id, label, mode, credit_cost, quantity_per_redemption, notes)
select p.id, '4 盒任搭為 1 組', 'mix_and_match', 1, 4, '任搭兌換規則'
from package_plans p
join students s on s.id = p.student_id
where s.share_token = 'yi-ning'
and not exists (select 1 from redemption_rules where package_plan_id = p.id and label = '4 盒任搭為 1 組');

insert into redemption_rules (package_plan_id, label, mode, credit_cost, quantity_per_redemption, notes)
select p.id, '7 盒任搭為 1 組', 'mix_and_match', 1, 7, '任搭兌換規則'
from package_plans p
join students s on s.id = p.student_id
where s.share_token = 'yi-ning'
and not exists (select 1 from redemption_rules where package_plan_id = p.id and label = '7 盒任搭為 1 組');

insert into redemption_rule_products (redemption_rule_id, product_id)
select r.id, pr.id
from redemption_rules r
join package_plans p on p.id = r.package_plan_id
join students s on s.id = p.student_id
join products pr on pr.slug in (
  'magic-so-burning-body',
  'magic-so-oil-cut',
  'magic-so-3-8',
  'premium-fish-oil',
  'b-complex-ex',
  'multi-strain-probiotics-ex',
  'plant-dha-algae-oil',
  'shelening',
  'prostate-care-ex',
  'cranberry-private-care',
  'aurora-white-ex',
  'sensitive-probiotics',
  'joint-steady-ex',
  'clean-circulation-drink',
  'natto-red-yeast-q10',
  'smart-light-drink'
)
where s.share_token = 'yi-ning' and r.label = '5 盒一組'
on conflict do nothing;

insert into redemption_rule_products (redemption_rule_id, product_id)
select r.id, pr.id
from redemption_rules r
join package_plans p on p.id = r.package_plan_id
join students s on s.id = p.student_id
join products pr on pr.slug in ('youthfountain-delete', 'youthfountain-reborn', 'youthfountain-protect')
where s.share_token = 'yi-ning' and r.label = '1 盒一組'
on conflict do nothing;

insert into redemption_rule_products (redemption_rule_id, product_id)
select r.id, pr.id
from redemption_rules r
join package_plans p on p.id = r.package_plan_id
join students s on s.id = p.student_id
join products pr on pr.slug in ('calcium-magnesium-zinc-ex', 'magic-so-beauty-jelly')
where s.share_token = 'yi-ning' and r.label = '6 盒一組'
on conflict do nothing;

insert into redemption_rule_products (redemption_rule_id, product_id)
select r.id, pr.id
from redemption_rules r
join package_plans p on p.id = r.package_plan_id
join students s on s.id = p.student_id
join products pr on pr.slug in ('sleep-care-ex', 'maca-vitality-ex', 'liver-care-ex', 'red-yeast-circulation-ex', 'lutein-crystal')
where s.share_token = 'yi-ning' and r.label = '8 盒一組'
on conflict do nothing;

insert into redemption_rule_products (redemption_rule_id, product_id)
select r.id, pr.id
from redemption_rules r
join package_plans p on p.id = r.package_plan_id
join students s on s.id = p.student_id
join products pr on pr.slug in ('grow-up-drink', 'polysaccharide-drink')
where s.share_token = 'yi-ning' and r.label = '7 盒一組'
on conflict do nothing;

insert into redemption_rule_products (redemption_rule_id, product_id)
select r.id, pr.id
from redemption_rules r
join package_plans p on p.id = r.package_plan_id
join students s on s.id = p.student_id
join products pr on pr.slug in ('all-in-one-drink')
where s.share_token = 'yi-ning' and r.label = '3 盒一組'
on conflict do nothing;

insert into redemption_rule_products (redemption_rule_id, product_id)
select r.id, pr.id
from redemption_rules r
join package_plans p on p.id = r.package_plan_id
join students s on s.id = p.student_id
join products pr on pr.slug in (
  'cranberry-private-care',
  'prostate-care-ex',
  'shelening',
  'aurora-white-ex',
  'sensitive-probiotics',
  'multi-strain-probiotics-ex',
  'b-complex-ex'
)
where s.share_token = 'yi-ning' and r.label = '4 盒任搭為 1 組'
on conflict do nothing;

insert into redemption_rule_products (redemption_rule_id, product_id)
select r.id, pr.id
from redemption_rules r
join package_plans p on p.id = r.package_plan_id
join students s on s.id = p.student_id
join products pr on pr.slug in ('lutein-crystal', 'liver-care-ex', 'maca-vitality-ex', 'sleep-care-ex')
where s.share_token = 'yi-ning' and r.label = '7 盒任搭為 1 組'
on conflict do nothing;

insert into class_sessions (student_id, session_date, session_time, title, status, content, notes, counts_toward_used_sessions)
select id, '2026-07-08', '18:30', '初始評估與訓練規劃', 'scheduled', null, '帶近期身體狀態與補給紀錄。', false
from students
where share_token = 'yi-ning'
and not exists (select 1 from class_sessions where student_id = students.id);

insert into redemption_records (student_id, package_plan_id, record_date, source_type, credit_used, notes)
select s.id, p.id, '2026-07-01', 'bundle', 1, 'D*3 + R*3 優惠套組部分領取，已給 2 罐 D + 2 罐 R。'
from students s
join package_plans p on p.student_id = s.id
where s.share_token = 'yi-ning'
and not exists (select 1 from redemption_records where student_id = s.id and record_date = '2026-07-01');

insert into redemption_record_items (redemption_record_id, product_id, item_name, quantity)
select rr.id, p.id, p.name, 2
from redemption_records rr
join students s on s.id = rr.student_id
join products p on p.slug = 'youthfountain-delete'
where s.share_token = 'yi-ning' and rr.record_date = '2026-07-01'
and not exists (select 1 from redemption_record_items where redemption_record_id = rr.id and item_name = p.name);

insert into redemption_record_items (redemption_record_id, product_id, item_name, quantity)
select rr.id, p.id, p.name, 2
from redemption_records rr
join students s on s.id = rr.student_id
join products p on p.slug = 'youthfountain-reborn'
where s.share_token = 'yi-ning' and rr.record_date = '2026-07-01'
and not exists (select 1 from redemption_record_items where redemption_record_id = rr.id and item_name = p.name);

insert into redemption_record_items (redemption_record_id, product_id, item_name, quantity)
select rr.id, p.id, p.name, 1
from redemption_records rr
join students s on s.id = rr.student_id
join products p on p.slug = 'b-complex-ex'
where s.share_token = 'yi-ning' and rr.record_date = '2026-07-01'
and not exists (select 1 from redemption_record_items where redemption_record_id = rr.id and item_name = p.name);
