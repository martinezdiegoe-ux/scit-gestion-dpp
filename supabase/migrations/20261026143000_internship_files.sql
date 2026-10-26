-- Archivos de pasantías y foto de perfil, privados para usuarios SCIT activos.
alter table public.interns add column if not exists photo_path text;
create table if not exists public.internship_files (
 id uuid primary key default gen_random_uuid(),
 slot_id uuid not null references public.internship_slots(id) on delete cascade,
 intern_id uuid references public.interns(id) on delete set null,
 assignment_id uuid references public.internship_assignments(id) on delete set null,
 act_id uuid references public.normative_acts(id) on delete set null,
 term_id uuid references public.internship_terms(id) on delete set null,
 category text not null check (category in ('CONVOCATORIA','DESIGNACION','BAJA','CONVENIO_INICIAL','CONVENIO_RENOVACION','OTRO')),
 title text not null,
 storage_path text not null unique,
 uploaded_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists internship_files_slot_idx on public.internship_files(slot_id,created_at desc);
alter table public.internship_files enable row level security;
create policy internship_files_read on public.internship_files for select to authenticated using (public.my_role() is not null);
create policy internship_files_insert on public.internship_files for insert to authenticated with check (public.my_role() in ('director','coordinador','administrativo') and uploaded_by=(select auth.uid()));
create policy internship_files_delete on public.internship_files for delete to authenticated using (public.my_role() in ('director','coordinador','administrativo'));
grant select,insert,delete on public.internship_files to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('scit-internships','scit-internships',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy scit_internship_storage_read on storage.objects for select to authenticated
using (bucket_id='scit-internships' and public.my_role() is not null);
create policy scit_internship_storage_insert on storage.objects for insert to authenticated
with check (bucket_id='scit-internships' and public.my_role() in ('director','coordinador','administrativo'));
create policy scit_internship_storage_delete on storage.objects for delete to authenticated
using (bucket_id='scit-internships' and public.my_role() in ('director','coordinador','administrativo'));
