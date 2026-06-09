-- Supabase SQL Editor 执行本文件后，网页会支持：
-- 1. 注册时选择部门
-- 2. 后台注销员工
-- 3. 删除现有 zhangming 员工账号及其完成记录/评论

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.training_normalize_department(input_department text)
returns text
language sql
immutable
as $$
  select case
    when input_department in ('人力资源部', '财务部', '市场部', '销售部', '技术部', '运营部')
      then input_department
    else '人力资源部'
  end;
$$;

drop function if exists public.training_auth_register(text, text);

create or replace function public.training_auth_register(
  input_username text,
  input_password text,
  input_department text default '人力资源部'
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
  normalized_department text := public.training_normalize_department(input_department);
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
  values (normalized_username, normalized_username, normalized_department, '员工')
  returning id into new_employee_id;

  insert into public.training_users (username, password_hash, role, employee_id)
  values (
    normalized_username,
    extensions.crypt(input_password, extensions.gen_salt('bf')),
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

create or replace function public.training_delete_employee(
  input_employee_id uuid,
  input_username text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(trim(input_username)) <> 'supermanager' then
    raise exception '只有后台账号可以注销员工';
  end if;

  delete from public.task_comments
  where employee_id = input_employee_id;

  delete from public.training_completions
  where employee_id = input_employee_id;

  delete from public.training_users
  where employee_id = input_employee_id;

  delete from public.employees
  where id = input_employee_id;
end;
$$;

grant execute on function public.training_normalize_department(text) to anon, authenticated;
grant execute on function public.training_auth_register(text, text, text) to anon, authenticated;
grant execute on function public.training_delete_employee(uuid, text) to anon, authenticated;

do $$
declare
  zhangming_employee_id uuid;
begin
  select id
  into zhangming_employee_id
  from public.employees
  where lower(code) = 'zhangming' or lower(name) = 'zhangming'
  limit 1;

  if zhangming_employee_id is not null then
    perform public.training_delete_employee(zhangming_employee_id, 'supermanager');
  end if;
end;
$$;
