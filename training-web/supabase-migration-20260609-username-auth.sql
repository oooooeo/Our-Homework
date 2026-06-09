-- Supabase SQL Editor 执行本文件后，网页会支持：
-- 1. 使用唯一用户名自助注册员工
-- 2. 使用同一用户名再次登录员工端

alter table public.employees
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists employees_code_unique_idx
  on public.employees (code);

alter table public.employees enable row level security;

drop policy if exists "employees_select_all" on public.employees;
create policy "employees_select_all"
  on public.employees
  for select
  to anon, authenticated
  using (true);

drop policy if exists "employees_insert_self_register" on public.employees;
create policy "employees_insert_self_register"
  on public.employees
  for insert
  to anon, authenticated
  with check (
    code is not null
    and code <> 'supermanager'
    and code = lower(code)
    and code ~ '^[a-z0-9_-]{2,32}$'
  );

grant select, insert on public.employees to anon, authenticated;
grant usage on schema public to anon, authenticated;
