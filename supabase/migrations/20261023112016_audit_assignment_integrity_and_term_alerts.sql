-- Registro automatico de modificaciones sin exponer escritura al cliente.
create or replace function public.scit_audit_changes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare rid text;
begin
 rid := case when tg_op='DELETE' then old.id::text else new.id::text end;
 insert into public.audit_log(user_id,table_name,record_id,action,payload)
 values(auth.uid(),tg_table_name,rid,tg_op,
   jsonb_build_object('old',case when tg_op='INSERT' then null else to_jsonb(old) end,
                      'new',case when tg_op='DELETE' then null else to_jsonb(new) end));
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function public.scit_audit_changes() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['projects','project_milestones','project_objectives','project_key_results','project_tasks','project_indicators','project_risks','internship_slots','interns','normative_acts','internship_assignments','internship_terms','communication_items'] loop
 execute format('create trigger scit_audit_%I after insert or update or delete on public.%I for each row execute function public.scit_audit_changes()',t,t);
 end loop;
end $$;
-- Validar designaciones por cupo, incluso las que ya terminaron.
create or replace function public.scit_validate_assignment() returns trigger language plpgsql set search_path = '' as $$
begin
 if new.end_date < new.start_date then raise exception 'Fecha final anterior al inicio'; end if;
 if exists(select 1 from public.internship_assignments a
 where a.slot_id=new.slot_id and a.id<>new.id
 and daterange(a.start_date,coalesce(a.ended_at,a.end_date),'[]') &&
 daterange(new.start_date,coalesce(new.ended_at,new.end_date),'[]')) then
 raise exception 'El cupo tiene una designacion superpuesta'; end if;
 return new;
end $$;
create trigger scit_validate_assignment before insert or update on public.internship_assignments
for each row execute function public.scit_validate_assignment();
-- Una alerta por el convenio vigente, diferenciando la etapa.
create view public.internship_term_alerts with (security_invoker=true) as
select s.code,s.city,i.full_name,a.id assignment_id,t.id term_id,t.kind,
t.end_date,(t.end_date-current_date) days_remaining,
case when t.end_date<current_date then 'VENCIDO'
when t.end_date-current_date<=30 then 'CRITICA'
when t.end_date-current_date<=60 then 'ALTA'
when t.end_date-current_date<=90 then 'MEDIA'
when t.end_date-current_date<=120 then 'PREAVISO' else 'OK' end alert_level
from public.internship_terms t
join public.internship_assignments a on a.id=t.assignment_id
join public.internship_slots s on s.id=a.slot_id
join public.interns i on i.id=a.intern_id
where a.status='ACTIVA'
and not exists(select 1 from public.internship_terms next_term
 where next_term.assignment_id=t.assignment_id and next_term.start_date>t.start_date);
