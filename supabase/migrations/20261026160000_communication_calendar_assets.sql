-- Agenda de comunicación y materiales de revisión privados.
alter table public.communication_items add column if not exists target_time time;
alter table public.communication_items add column if not exists location text;
create index if not exists communication_items_target_date_idx on public.communication_items(target_date,target_time);
create table if not exists public.communication_assets (
 id uuid primary key default gen_random_uuid(),
 item_id uuid not null references public.communication_items(id) on delete cascade,
 storage_path text not null unique,
 file_name text not null,
 review_status text not null default 'EN_REVISION' check(review_status in ('EN_REVISION','APROBADA','DESCARTADA')),
 notes text,
 uploaded_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists communication_assets_item_idx on public.communication_assets(item_id,created_at);
alter table public.communication_assets enable row level security;
create policy communication_assets_read on public.communication_assets for select to authenticated using (public.my_role() is not null);
create policy communication_assets_insert on public.communication_assets for insert to authenticated with check (public.my_role() in ('director','coordinador','administrativo') and uploaded_by=(select auth.uid()));
create policy communication_assets_update on public.communication_assets for update to authenticated using (public.my_role() in ('director','coordinador','administrativo')) with check (public.my_role() in ('director','coordinador','administrativo'));
create policy communication_assets_delete on public.communication_assets for delete to authenticated using (public.my_role() in ('director','coordinador','administrativo'));
grant select,insert,update,delete on public.communication_assets to authenticated;
create trigger scit_audit_communication_assets after insert or update or delete on public.communication_assets for each row execute function public.scit_audit_changes();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('scit-communication','scit-communication',false,15728640,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy scit_communication_storage_read on storage.objects for select to authenticated
using(bucket_id='scit-communication' and public.my_role() is not null);
create policy scit_communication_storage_insert on storage.objects for insert to authenticated
with check(bucket_id='scit-communication' and public.my_role() in ('director','coordinador','administrativo'));
create policy scit_communication_storage_delete on storage.objects for delete to authenticated
using(bucket_id='scit-communication' and public.my_role() in ('director','coordinador','administrativo'));
