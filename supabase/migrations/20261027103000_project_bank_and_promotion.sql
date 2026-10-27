-- Cartera histórica independiente de la gestión de proyectos en ejecución.
create table public.project_bank (
 id uuid primary key default gen_random_uuid(),
 source_number integer unique,
 applicant text not null,
 name text not null,
 problem text,
 objective text,
 scope text,
 duration text,
 needs text,
 financing text,
 cost text,
 benefit text,
 expedient text,
 approval text,
 historical_status text,
 observations text,
 development_stage text not null default 'SIN_CLASIFICAR'
   check (development_stage in ('SIN_CLASIFICAR','IDEA','ANTEPROYECTO','FORMULACION','PROYECTO_EJECUTIVO','APROBADO','POSTERGADO','DESCARTADO')),
 project_id uuid unique references public.projects(id) on delete set null,
 source_document text,
 source_date date,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index project_bank_applicant_idx on public.project_bank(applicant);
create index project_bank_stage_idx on public.project_bank(development_stage);
alter table public.project_bank enable row level security;
grant select, insert, update on public.project_bank to authenticated;
create policy project_bank_read on public.project_bank for select to authenticated
 using ((select public.my_role()) is not null);
create policy project_bank_insert on public.project_bank for insert to authenticated
 with check ((select public.my_role()) in ('director','coordinador','administrativo'));
create policy project_bank_update on public.project_bank for update to authenticated
 using ((select public.my_role()) in ('director','coordinador','administrativo'))
 with check ((select public.my_role()) in ('director','coordinador','administrativo'));

-- La transición es atómica y sólo se admite cuando comienza la ejecución.
create or replace function public.start_bank_project(bank_id uuid, execution_start date, manager text default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare entry public.project_bank%rowtype; new_id uuid;
begin
 if (select public.my_role()) not in ('director','coordinador','administrativo') then
  raise exception 'Sin permiso para iniciar la ejecución';
 end if;
 if execution_start is null then raise exception 'Indicá la fecha de inicio de ejecución'; end if;
 select * into entry from public.project_bank where id=bank_id for update;
 if not found then raise exception 'Proyecto no encontrado'; end if;
 if entry.project_id is not null then raise exception 'La ejecución ya fue iniciada'; end if;
 insert into public.projects(name,description,area,responsible,status,progress,start_date,notes)
 values(entry.name,entry.objective,entry.applicant,coalesce(nullif(manager,''),'A designar'),'EJECUCION',0,
  execution_start,'Origen: Banco de Proyectos, registro '||coalesce(entry.source_number::text,'nuevo')||'.')
 returning id into new_id;
 update public.project_bank set project_id=new_id,updated_at=now() where id=entry.id;
 return new_id;
end $$;
revoke all on function public.start_bank_project(uuid,date,text) from public,anon;
grant execute on function public.start_bank_project(uuid,date,text) to authenticated;

-- El registro fuente se conserva aunque luego se gestione su ejecución.

-- Los registros históricos se importaron directamente a la base privada.
create trigger scit_audit_project_bank after insert or update or delete on public.project_bank for each row execute function public.scit_audit_changes();
