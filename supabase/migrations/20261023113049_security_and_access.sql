-- Acceso institucional y separación de privilegios. No modifica registros existentes.
create schema if not exists scit_private;
revoke all on schema scit_private from public, anon;
grant usage on schema scit_private to authenticated;

create or replace function scit_private.current_role()
returns public.app_role language sql stable security definer set search_path = ''
as $$ select p.role from public.profiles p where p.id = (select auth.uid()) and p.active = true $$;
revoke all on function scit_private.current_role() from public, anon;
grant execute on function scit_private.current_role() to authenticated;

create or replace function public.my_role()
returns public.app_role language sql stable security invoker set search_path = ''
as $$ select scit_private.current_role() $$;
revoke all on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated;

-- Las políticas de lectura anteriores permitían datos a cualquier cuenta autenticada, aun inactiva.
do $$
declare t text; p record;
begin
  foreach t in array array[
    'internship_slots','interns','normative_acts','internship_assignments',
    'internship_terms','projects','project_milestones','communication_items',
    'project_objectives','project_key_results','project_tasks',
    'project_indicators','project_risks','project_task_dependencies'
  ] loop
    for p in select policyname from pg_policies where schemaname='public'
      and tablename=t and cmd in ('SELECT','ALL') loop
      execute format('drop policy %I on public.%I',p.policyname,t);
    end loop;
    execute format('create policy scit_read on public.%I for select to authenticated using ((select public.my_role()) is not null)',t);
    execute format('create policy scit_insert on public.%I for insert to authenticated with check ((select public.my_role()) in (''director'',''coordinador'',''administrativo''))',t);
    execute format('create policy scit_update on public.%I for update to authenticated using ((select public.my_role()) in (''director'',''coordinador'',''administrativo'')) with check ((select public.my_role()) in (''director'',''coordinador'',''administrativo''))',t);
    execute format('create policy scit_delete on public.%I for delete to authenticated using ((select public.my_role()) = ''director'')',t);
  end loop;
end $$;

-- Los perfiles sólo los administra un director; el alta automática sigue creando lectura.
create policy profile_director_update on public.profiles for update to authenticated
using ((select public.my_role()) = 'director')
with check ((select public.my_role()) = 'director');
revoke insert, delete on public.profiles from authenticated;
grant select, update on public.profiles to authenticated;

-- Evita que un cliente cambie la identidad del perfil, incluso con permisos de director.
create or replace function scit_private.guard_profile_identity()
returns trigger language plpgsql set search_path = ''
as $$ begin
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'Identidad del perfil inmutable';
  end if;
  return new;
end $$;
create trigger scit_guard_profile_identity before update on public.profiles
for each row execute function scit_private.guard_profile_identity();

-- Las alertas conservan RLS de las tablas subyacentes.
create or replace view public.internship_alerts with (security_invoker=true) as
select a.id assignment_id,s.code,s.city,i.full_name,a.end_date,
(a.end_date-current_date) days_remaining,
case when a.end_date<current_date then 'VENCIDO'
when a.end_date-current_date<=30 then 'CRITICA'
when a.end_date-current_date<=60 then 'ALTA'
when a.end_date-current_date<=90 then 'MEDIA'
when a.end_date-current_date<=120 then 'PREAVISO' else 'OK' end alert_level
from public.internship_assignments a
join public.internship_slots s on s.id=a.slot_id
join public.interns i on i.id=a.intern_id
where a.status='ACTIVA';
