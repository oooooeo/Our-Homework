-- Supabase SQL Editor 执行本文件后，网页会支持：
-- 1. 用户名 + 密码注册/登录
-- 2. 用户名唯一，密码允许重复
-- 3. supermanager 后台登录
-- 4. 后台撤回/删除任务

create extension if not exists pgcrypto;

alter table public.training_tasks
  add column if not exists due_at timestamptz;

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.training_tasks(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.task_comments enable row level security;

drop policy if exists "task_comments_select_all" on public.task_comments;
create policy "task_comments_select_all"
  on public.task_comments
  for select
  to anon, authenticated
  using (true);

drop policy if exists "task_comments_insert_all" on public.task_comments;
create policy "task_comments_insert_all"
  on public.task_comments
  for insert
  to anon, authenticated
  with check (
    body is not null
    and length(trim(body)) > 0
  );

grant select, insert on public.task_comments to anon, authenticated;

create table if not exists public.training_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  role text not null default 'employee' check (role in ('employee', 'manager')),
  employee_id uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.training_completions
  drop constraint if exists training_completions_task_id_fkey;

alter table public.training_completions
  add constraint training_completions_task_id_fkey
  foreign key (task_id) references public.training_tasks(id) on delete cascade;

alter table public.task_comments
  drop constraint if exists task_comments_task_id_fkey;

alter table public.task_comments
  add constraint task_comments_task_id_fkey
  foreign key (task_id) references public.training_tasks(id) on delete cascade;

alter table public.training_users enable row level security;

drop policy if exists "training_users_no_direct_select" on public.training_users;
create policy "training_users_no_direct_select"
  on public.training_users
  for select
  to anon, authenticated
  using (false);

drop policy if exists "training_users_no_direct_insert" on public.training_users;
create policy "training_users_no_direct_insert"
  on public.training_users
  for insert
  to anon, authenticated
  with check (false);

create or replace function public.training_auth_register(
  input_username text,
  input_password text
)
returns table (
  role text,
  username text,
  employee_id uuid,
  employee_name text,
  department text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_username text := lower(trim(input_username));
  new_employee_id uuid;
begin
  if normalized_username = 'supermanager' then
    raise exception 'supermanager 是后台账号，不能注册为员工';
  end if;

  if normalized_username !~ '^[a-z0-9_-]{2,32}$' then
    raise exception '用户名只能使用 2-32 位小写字母、数字、下划线或短横线';
  end if;

  if length(coalesce(input_password, '')) < 6 then
    raise exception '密码至少需要 6 位';
  end if;

  insert into public.employees (code, name, department, role)
  values (normalized_username, normalized_username, '自助注册', '员工')
  returning id into new_employee_id;

  insert into public.training_users (username, password_hash, role, employee_id)
  values (
    normalized_username,
    crypt(input_password, gen_salt('bf')),
    'employee',
    new_employee_id
  );

  return query
    select
      'employee'::text,
      normalized_username,
      e.id,
      e.name,
      e.department
    from public.employees e
    where e.id = new_employee_id;
exception
  when unique_violation then
    raise exception '用户名已存在，请换一个用户名或直接登录';
end;
$$;

create or replace function public.training_auth_login(
  input_username text,
  input_password text
)
returns table (
  role text,
  username text,
  employee_id uuid,
  employee_name text,
  department text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_username text := lower(trim(input_username));
  found_user public.training_users%rowtype;
begin
  if normalized_username = 'supermanager' then
    if input_password = 'supermanager' then
      return query
        select
          'manager'::text,
          'supermanager'::text,
          null::uuid,
          'supermanager'::text,
          '后台'::text;
      return;
    end if;

    raise exception '后台密码不正确';
  end if;

  select *
  into found_user
  from public.training_users
  where training_users.username = normalized_username;

  if not found then
    raise exception '用户名不存在，请先注册';
  end if;

  if found_user.password_hash <> crypt(input_password, found_user.password_hash) then
    raise exception '密码不正确';
  end if;

  return query
    select
      found_user.role,
      found_user.username,
      e.id,
      e.name,
      e.department
    from public.employees e
    where e.id = found_user.employee_id;
end;
$$;

create or replace function public.training_delete_task(
  input_task_id uuid,
  input_username text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(trim(input_username)) <> 'supermanager' then
    raise exception '只有后台账号可以删除任务';
  end if;

  delete from public.training_tasks
  where id = input_task_id;
end;
$$;

grant execute on function public.training_auth_register(text, text) to anon, authenticated;
grant execute on function public.training_auth_login(text, text) to anon, authenticated;
grant execute on function public.training_delete_task(uuid, text) to anon, authenticated;
