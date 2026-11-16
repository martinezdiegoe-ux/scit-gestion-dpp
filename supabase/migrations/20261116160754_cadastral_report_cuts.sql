create table public.scit_report_cuts (
  cut_date date not null,
  source text not null,
  payload jsonb not null,
  primary key (cut_date, source),
  check (source in ('situation', 'fac_north', 'fac_south', 'vep')),
  check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 131072),
  check (
    case source
      when 'situation' then payload ?& array['fac','paid','unpaid','precec','inPerson','functionalUnits','certificateNotes','mensuras','digitalPlans','veps']
      when 'vep' then payload ?& array['pending','lotStates','steByDay','steByPlanAge','steRequests','steRows']
      else payload ?& array['total','overdue','dueToday','reentries','ages','reasons','states','surfaces']
    end
  )
);

alter table public.scit_report_cuts enable row level security;
revoke all on public.scit_report_cuts from public, anon, authenticated;
grant select, insert, update on public.scit_report_cuts to authenticated;

create policy scit_read on public.scit_report_cuts for select to authenticated
  using ((select public.my_role()) is not null);
create policy scit_insert on public.scit_report_cuts for insert to authenticated
  with check ((select public.my_role()) in ('director', 'coordinador', 'administrativo'));
create policy scit_update on public.scit_report_cuts for update to authenticated
  using ((select public.my_role()) in ('director', 'coordinador', 'administrativo'))
  with check ((select public.my_role()) in ('director', 'coordinador', 'administrativo'));
