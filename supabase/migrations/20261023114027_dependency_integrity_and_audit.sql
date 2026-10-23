-- Las dependencias permanecen dentro de cada proyecto y sin ciclos.
create or replace function public.scit_validate_dependency()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare first_project uuid; second_project uuid;
begin
 select project_id into first_project from public.project_tasks where id=new.task_id;
 select project_id into second_project from public.project_tasks where id=new.depends_on_id;
 if first_project is distinct from second_project then raise exception 'Las tareas deben pertenecer al mismo proyecto'; end if;
 if exists(
   with recursive downstream(id) as (
     select new.depends_on_id
     union
     select d.depends_on_id from public.project_task_dependencies d join downstream p on d.task_id=p.id
   ) select 1 from downstream where id=new.task_id
 ) then raise exception 'La dependencia produciria un ciclo'; end if;
 return new;
end $$;
create trigger scit_validate_dependency before insert or update on public.project_task_dependencies
for each row execute function public.scit_validate_dependency();
revoke all on function public.scit_validate_dependency() from public,anon,authenticated;

create trigger scit_audit_profiles after update on public.profiles
for each row execute function public.scit_audit_changes();

create or replace function public.scit_audit_dependency()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 insert into public.audit_log(user_id,table_name,record_id,action,payload)
 values(auth.uid(),'project_task_dependencies',
  case when tg_op='DELETE' then old.task_id::text else new.task_id::text end,tg_op,
  jsonb_build_object('old',case when tg_op='INSERT' then null else to_jsonb(old) end,
                     'new',case when tg_op='DELETE' then null else to_jsonb(new) end));
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function public.scit_audit_dependency() from public,anon,authenticated;
create trigger scit_audit_dependencies after insert or update or delete on public.project_task_dependencies
for each row execute function public.scit_audit_dependency();
