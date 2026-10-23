-- El equipo activo puede seleccionar responsables entre perfiles activos.
drop policy if exists profile_self on public.profiles;
create policy profile_staff_read on public.profiles for select to authenticated
using (
 id=(select auth.uid())
 or ((select public.my_role()) is not null and active=true)
 or ((select public.my_role())='director')
);
