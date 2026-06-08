-- Supabase SQL Editor 执行本文件后，网页才会完整支持：
-- 1. 培训任务截止时间
-- 2. 员工端任务评论区

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
grant usage on schema public to anon, authenticated;
