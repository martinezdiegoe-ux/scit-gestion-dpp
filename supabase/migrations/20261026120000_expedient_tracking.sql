-- Seguimiento de expedientes. El retiro del panel conserva historia y auditoría.
create table public.tracked_expedients (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  kind text not null check (kind in ('PAPEL','DIGITAL')),
  caratula text,
  topic text,
  concept text,
  originator text,
  started_at timestamptz,
  current_office text,
  previous_office text,
  last_transfer_at timestamptz,
  priority text not null default 'NORMAL' check (priority in ('BAJA','NORMAL','ALTA','URGENTE')),
  status text not null default 'ACTIVO' check (status in ('ACTIVO','ARCHIVADO')),
  last_checked_at timestamptz,
  last_error text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint expediente_formato check (
    (kind='PAPEL' and number ~ '^[0-9]{3,8}-[0-9]{1,12}-[0-9]$') or
    (kind='DIGITAL' and number ~ '^EE-[0-9]{4}-[0-9]{8}-APPSF-[A-Z0-9]+$')
  )
);
create index tracked_expedients_active_priority on public.tracked_expedients(status,priority,last_transfer_at);
alter table public.tracked_expedients enable row level security;
grant select,insert,update on public.tracked_expedients to authenticated;
create policy expediente_read on public.tracked_expedients for select to authenticated
  using ((select public.my_role()) is not null);
create policy expediente_insert on public.tracked_expedients for insert to authenticated
  with check ((select public.my_role()) in ('director','coordinador','administrativo') and created_by=(select auth.uid()));
create policy expediente_update on public.tracked_expedients for update to authenticated
  using ((select public.my_role()) in ('director','coordinador','administrativo'))
  with check ((select public.my_role()) in ('director','coordinador','administrativo'));
create trigger scit_audit_expedients after insert or update on public.tracked_expedients
  for each row execute function public.scit_audit_changes();

-- Invocaciones automáticas: un secreto independiente, guardado sólo en Vault.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
do $$ begin
 if not exists(select 1 from vault.secrets where name='scit_expedient_cron') then
   perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'scit_expedient_cron');
 end if;
end $$;

create or replace function public.scit_verify_expedient_cron_token(provided text)
returns boolean language sql stable security definer set search_path=''
as $$ select provided is not null and provided = (select decrypted_secret from vault.decrypted_secrets where name='scit_expedient_cron') $$;
revoke all on function public.scit_verify_expedient_cron_token(text) from public,anon,authenticated;
grant execute on function public.scit_verify_expedient_cron_token(text) to service_role;

-- pg_cron trabaja en UTC: 11:00 y 16:00 corresponden a 08:00 y 13:00 en Argentina.
select cron.schedule('scit-expedientes-08-arg','0 11 * * *', $$
 select net.http_post(
   url:='https://iwouqdqoaurhqxdulnxh.supabase.co/functions/v1/refresh-expedients',
   headers:='{"Content-Type":"application/json"}'::jsonb,
   body:=jsonb_build_object('cron_token',(select decrypted_secret from vault.decrypted_secrets where name='scit_expedient_cron')),
   timeout_milliseconds:=120000
 );
$$);
select cron.schedule('scit-expedientes-13-arg','0 16 * * *', $$
 select net.http_post(
   url:='https://iwouqdqoaurhqxdulnxh.supabase.co/functions/v1/refresh-expedients',
   headers:='{"Content-Type":"application/json"}'::jsonb,
   body:=jsonb_build_object('cron_token',(select decrypted_secret from vault.decrypted_secrets where name='scit_expedient_cron')),
   timeout_milliseconds:=120000
 );
$$);
