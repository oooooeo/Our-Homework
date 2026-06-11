-- Supabase SQL Editor 执行本文件后，网页会支持：
-- 1. 后台发布任务时选择目标部门
-- 2. 员工端区分本部门必修任务和学习广场任务

alter table public.training_tasks
add column if not exists target_departments text[] not null default array[
  '人力资源部',
  '财务部',
  '市场部',
  '销售部',
  '技术部',
  '运营部'
];

update public.training_tasks
set target_departments = array[
  '人力资源部',
  '财务部',
  '市场部',
  '销售部',
  '技术部',
  '运营部'
]
where target_departments is null
   or array_length(target_departments, 1) is null;

alter table public.training_tasks
drop constraint if exists training_tasks_target_departments_not_empty;

alter table public.training_tasks
add constraint training_tasks_target_departments_not_empty
check (array_length(target_departments, 1) >= 1);
