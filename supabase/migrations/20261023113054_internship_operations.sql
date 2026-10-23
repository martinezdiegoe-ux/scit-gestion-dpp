-- Operaciones atómicas de pasantías: alta, renovación única y finalización.
create or replace function public.scit_create_assignment(
 p_slot_id uuid,p_intern_id uuid,p_start_date date,p_office text default null,
 p_tutor text default null,p_designation_act_id uuid default null,p_call_act_id uuid default null,
 p_predecessor_assignment_id uuid default null,p_notes text default null
) returns uuid language plpgsql security invoker set search_path = ''
as $$
declare v_id uuid; v_end date;
begin
 if (select public.my_role()) not in ('director','coordinador','administrativo') then raise exception 'Sin permiso'; end if;
 perform 1 from public.internship_slots where id=p_slot_id and status in ('VACANTE','EN_GESTION') for update;
 if not found then raise exception 'El cupo no esta disponible'; end if;
 if p_start_date is null or p_start_date > current_date + 365 then raise exception 'Fecha inicial invalida'; end if;
 v_end := (p_start_date + interval '18 months')::date - 1;
 insert into public.internship_assignments(slot_id,intern_id,start_date,end_date,office,tutor,
 designation_act_id,call_act_id,predecessor_assignment_id,notes)
 values(p_slot_id,p_intern_id,p_start_date,v_end,p_office,p_tutor,
 p_designation_act_id,p_call_act_id,p_predecessor_assignment_id,p_notes) returning id into v_id;
 insert into public.internship_terms(assignment_id,kind,start_date,end_date)
 values(v_id,'INICIAL_12',p_start_date,(p_start_date+interval '12 months')::date-1);
 update public.internship_slots set status='CUBIERTO',office=coalesce(p_office,office),updated_at=now() where id=p_slot_id;
 return v_id;
end $$;
revoke all on function public.scit_create_assignment(uuid,uuid,date,text,text,uuid,uuid,uuid,text) from public,anon;
grant execute on function public.scit_create_assignment(uuid,uuid,date,text,text,uuid,uuid,uuid,text) to authenticated;

create or replace function public.scit_renew_assignment(p_assignment_id uuid,p_agreement_number text default null,p_act_id uuid default null)
returns uuid language plpgsql security invoker set search_path = ''
as $$
declare a public.internship_assignments%rowtype; initial_term public.internship_terms%rowtype; v_id uuid;
begin
 if (select public.my_role()) not in ('director','coordinador','administrativo') then raise exception 'Sin permiso'; end if;
 select * into a from public.internship_assignments where id=p_assignment_id and status='ACTIVA' for update;
 if not found then raise exception 'Designacion no activa'; end if;
 select * into initial_term from public.internship_terms where assignment_id=a.id and kind='INICIAL_12';
 if not found then raise exception 'Falta convenio inicial'; end if;
 insert into public.internship_terms(assignment_id,kind,start_date,end_date,agreement_number,act_id)
 values(a.id,'RENOVACION_6',initial_term.end_date+1,a.end_date,p_agreement_number,p_act_id)
 returning id into v_id;
 return v_id;
end $$;
revoke all on function public.scit_renew_assignment(uuid,text,uuid) from public,anon;
grant execute on function public.scit_renew_assignment(uuid,text,uuid) to authenticated;

create or replace function public.scit_close_assignment(p_assignment_id uuid,p_ended_at date,p_vacancy_act_id uuid default null)
returns void language plpgsql security invoker set search_path = ''
as $$
declare a public.internship_assignments%rowtype;
begin
 if (select public.my_role()) not in ('director','coordinador','administrativo') then raise exception 'Sin permiso'; end if;
 select * into a from public.internship_assignments where id=p_assignment_id and status='ACTIVA' for update;
 if not found then raise exception 'Designacion no activa'; end if;
 if p_ended_at < a.start_date or p_ended_at > a.end_date then raise exception 'Fecha de baja fuera de la designacion'; end if;
 update public.internship_assignments set status='FINALIZADA',ended_at=p_ended_at,
 vacancy_act_id=coalesce(p_vacancy_act_id,vacancy_act_id) where id=a.id;
 update public.internship_slots set status='VACANTE',updated_at=now() where id=a.slot_id;
end $$;
revoke all on function public.scit_close_assignment(uuid,date,uuid) from public,anon;
grant execute on function public.scit_close_assignment(uuid,date,uuid) to authenticated;
