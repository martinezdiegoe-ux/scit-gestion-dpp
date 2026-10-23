alter function public.validate_internship_term() set search_path = public, pg_temp;
revoke execute on function public.my_role() from anon;
-- La aplicación puede registrar usuarios nuevos con rol de solo lectura, sin autoasignación de privilegios.
create or replace function public.scit_create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,full_name,role,active)
 values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.email),'lectura',true)
 on conflict(id) do nothing;
 return new;
end $$;
revoke all on function public.scit_create_profile() from public,anon,authenticated;
create trigger scit_on_auth_user_created after insert on auth.users
for each row execute function public.scit_create_profile();
-- Cada designación admite exactamente un convenio por tipo.
create unique index internship_one_term_per_kind on public.internship_terms(assignment_id,kind);
-- Validar que no se modifique ni suprima el inicial mientras exista renovación.
create or replace function public.scit_protect_initial_term() returns trigger
language plpgsql set search_path = public,pg_temp as $$
begin
 if old.kind='INICIAL_12' and exists(
 select 1 from public.internship_terms t where t.assignment_id=old.assignment_id and t.kind='RENOVACION_6'
 ) then
   if tg_op='DELETE' or new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date
   or new.assignment_id is distinct from old.assignment_id or new.kind is distinct from old.kind then
     raise exception 'No se puede alterar el convenio inicial mientras existe renovacion';
   end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger scit_protect_initial_term before update or delete on public.internship_terms
for each row execute function public.scit_protect_initial_term();
