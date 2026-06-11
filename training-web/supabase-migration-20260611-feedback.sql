-- Supabase SQL Editor 执行本文件后，网页会支持员工反馈功能。

create table if not exists public.training_feedback (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete set null,
  task_id uuid references public.training_tasks(id) on delete set null,
  feedback_type text not null check (feedback_type in ('like', 'dislike', 'suggestion')),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists training_feedback_employee_id_idx
on public.training_feedback(employee_id);

create index if not exists training_feedback_task_id_idx
on public.training_feedback(task_id);

create index if not exists training_feedback_created_at_idx
on public.training_feedback(created_at desc);

alter table public.training_feedback enable row level security;

drop policy if exists "training_feedback_select_all" on public.training_feedback;
create policy "training_feedback_select_all"
  on public.training_feedback
  for select
  to anon, authenticated
  using (true);

drop policy if exists "training_feedback_insert_all" on public.training_feedback;
create policy "training_feedback_insert_all"
  on public.training_feedback
  for insert
  to anon, authenticated
  with check (
    feedback_type in ('like', 'dislike', 'suggestion')
    and body is not null
    and length(trim(body)) > 0
  );

grant select, insert on public.training_feedback to anon, authenticated;
