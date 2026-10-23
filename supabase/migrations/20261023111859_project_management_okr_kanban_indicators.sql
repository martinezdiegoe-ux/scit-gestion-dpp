create table public.project_objectives(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,
 title text not null,description text,period_start date,period_end date,created_at timestamptz not null default now());
create table public.project_key_results(
 id uuid primary key default gen_random_uuid(),objective_id uuid not null references public.project_objectives(id) on delete cascade,
 title text not null,metric text,baseline numeric,target numeric,current_value numeric,unit text,
 created_at timestamptz not null default now());
create table public.project_tasks(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,
 title text not null,description text,assignee_id uuid references public.profiles(id),
 status text not null default 'PENDIENTE' check(status in ('PENDIENTE','EN_PROCESO','BLOQUEADA','REVISION','HECHA')),
 priority text not null default 'MEDIA' check(priority in ('BAJA','MEDIA','ALTA','CRITICA')),
 start_date date,due_date date,completed_at timestamptz,blocker_reason text,
 progress integer not null default 0 check(progress between 0 and 100),created_at timestamptz not null default now());
create table public.project_indicators(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,
 title text not null,category text not null check(category in ('EFICACIA','EFICIENCIA','CALIDAD','IMPACTO')),
 unit text,baseline numeric,target numeric,current_value numeric,measured_at date,notes text,
 created_at timestamptz not null default now());
create table public.project_risks(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,
 title text not null,description text,probability integer check(probability between 1 and 5),
 impact integer check(impact between 1 and 5),mitigation text,status text default 'ABIERTO',
 created_at timestamptz not null default now());
create table public.project_task_dependencies(
 task_id uuid not null references public.project_tasks(id) on delete cascade,
 depends_on_id uuid not null references public.project_tasks(id) on delete cascade,
 primary key(task_id,depends_on_id),check(task_id<>depends_on_id));
create index project_tasks_project_status_idx on public.project_tasks(project_id,status);
create index project_tasks_due_idx on public.project_tasks(due_date);
create index project_key_results_objective_idx on public.project_key_results(objective_id);
do $$ declare t text; begin foreach t in array array['project_objectives','project_key_results','project_tasks','project_indicators','project_risks','project_task_dependencies'] loop
execute format('alter table public.%I enable row level security',t);
end loop; end $$;
create policy objectives_read on public.project_objectives for select to authenticated using(true);
create policy objectives_write on public.project_objectives for all to authenticated using(public.my_role() in ('director','coordinador','administrativo')) with check(public.my_role() in ('director','coordinador','administrativo'));
create policy key_results_read on public.project_key_results for select to authenticated using(true);
create policy key_results_write on public.project_key_results for all to authenticated using(public.my_role() in ('director','coordinador','administrativo')) with check(public.my_role() in ('director','coordinador','administrativo'));
create policy tasks_read on public.project_tasks for select to authenticated using(true);
create policy tasks_write on public.project_tasks for all to authenticated using(public.my_role() in ('director','coordinador','administrativo')) with check(public.my_role() in ('director','coordinador','administrativo'));
create policy indicators_read on public.project_indicators for select to authenticated using(true);
create policy indicators_write on public.project_indicators for all to authenticated using(public.my_role() in ('director','coordinador','administrativo')) with check(public.my_role() in ('director','coordinador','administrativo'));
create policy risks_read on public.project_risks for select to authenticated using(true);
create policy risks_write on public.project_risks for all to authenticated using(public.my_role() in ('director','coordinador','administrativo')) with check(public.my_role() in ('director','coordinador','administrativo'));
create policy dependencies_read on public.project_task_dependencies for select to authenticated using(true);
create policy dependencies_write on public.project_task_dependencies for all to authenticated using(public.my_role() in ('director','coordinador','administrativo')) with check(public.my_role() in ('director','coordinador','administrativo'));
