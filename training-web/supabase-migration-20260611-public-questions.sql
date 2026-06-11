-- Supabase SQL Editor 执行本文件后，网页会支持：
-- 1. 员工提交可公共检索的问题
-- 2. 员工端浏览、搜索公开问题
-- 3. 后台回复问题并更新处理状态

create table if not exists public.training_questions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete set null,
  task_id uuid references public.training_tasks(id) on delete set null,
  title text not null,
  body text not null,
  topic text not null default '系统使用',
  status text not null default 'open' check (status in ('open', 'answered', 'resolved')),
  answer_body text,
  answered_by text,
  answered_at timestamptz,
  view_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists training_questions_employee_id_idx
on public.training_questions(employee_id);

create index if not exists training_questions_task_id_idx
on public.training_questions(task_id);

create index if not exists training_questions_status_idx
on public.training_questions(status);

create index if not exists training_questions_created_at_idx
on public.training_questions(created_at desc);

alter table public.training_questions enable row level security;

drop policy if exists "training_questions_select_all" on public.training_questions;
create policy "training_questions_select_all"
  on public.training_questions
  for select
  to anon, authenticated
  using (true);

drop policy if exists "training_questions_insert_all" on public.training_questions;
create policy "training_questions_insert_all"
  on public.training_questions
  for insert
  to anon, authenticated
  with check (
    title is not null
    and body is not null
    and length(trim(title)) > 0
    and length(trim(body)) > 0
  );

create or replace function public.training_answer_question(
  input_question_id uuid,
  input_username text,
  input_answer text,
  input_status text default 'answered'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_status text := case
    when input_status in ('answered', 'resolved') then input_status
    else 'answered'
  end;
begin
  if lower(trim(input_username)) <> 'supermanager' then
    raise exception '只有后台账号可以回复问题';
  end if;

  if length(trim(coalesce(input_answer, ''))) = 0 then
    raise exception '回复内容不能为空';
  end if;

  update public.training_questions
  set
    answer_body = trim(input_answer),
    answered_by = lower(trim(input_username)),
    answered_at = now(),
    status = normalized_status,
    updated_at = now()
  where id = input_question_id;
end;
$$;

grant select, insert on public.training_questions to anon, authenticated;
grant execute on function public.training_answer_question(uuid, text, text, text) to anon, authenticated;
