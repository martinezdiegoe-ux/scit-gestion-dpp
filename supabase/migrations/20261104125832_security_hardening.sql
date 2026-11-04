-- Existing institutional accounts retain their current approval and role.
alter table public.profiles alter column active set default false;
create or replace function public.scit_create_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin
 insert into public.profiles(id,full_name,role,active)
 values(new.id,left(coalesce(new.raw_user_meta_data->>'full_name',new.email),150),'lectura',false)
 on conflict(id) do nothing;
 return new;
end $$;
revoke all on function public.scit_create_profile() from public,anon,authenticated;

-- A revoked, missing or older-than-12-hour session cannot read institutional data.
create or replace function scit_private.current_role()
returns public.app_role language sql stable security definer set search_path = ''
as $$
 select p.role from public.profiles p
 where p.id=(select auth.uid()) and p.active
 and exists (
  select 1 from auth.sessions s
  where s.user_id=p.id and s.id::text=(select auth.jwt()->>'session_id')
  and s.created_at>now()-interval '12 hours'
  and (s.not_after is null or s.not_after>now())
 )
$$;
revoke all on function scit_private.current_role() from public,anon;
grant execute on function scit_private.current_role() to authenticated;

-- Least privilege: clients cannot truncate tables or invoke internal triggers.
do $$ declare r record; begin
 for r in select c.relname,c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','v') loop
  execute format('revoke all on public.%I from anon',r.relname);
  if r.relkind='r' then
   execute format('revoke truncate,references,trigger on public.%I from authenticated',r.relname);
  end if;
 end loop;
end $$;
revoke all on function public.scit_validate_assignment(),public.validate_internship_term(),
 public.scit_protect_initial_term(),scit_private.guard_profile_identity() from public,anon,authenticated;

-- Atomic request budgets shared by every Edge Function instance; never exposed as data.
create table scit_private.request_budgets (
 subject text not null,
 action text not null,
 window_start timestamptz not null,
 requests integer not null check(requests>0),
 primary key(subject,action,window_start)
);
alter table scit_private.request_budgets enable row level security;
revoke all on scit_private.request_budgets from public,anon,authenticated;
create or replace function scit_private.consume_request_budget(subject text,action text)
returns integer language plpgsql security definer set search_path = ''
as $$ declare period_seconds integer; request_limit integer; start_at timestamptz; used integer;
begin
 case action
  when 'invite-user' then period_seconds:=3600; request_limit:=5;
  when 'refresh-expedients' then period_seconds:=60; request_limit:=10;
  when 'refresh-expedients-cron' then period_seconds:=60; request_limit:=4;
  else raise exception 'Invalid request budget';
 end case;
 if subject is null or length(subject)>100 then raise exception 'Invalid request subject'; end if;
 start_at:=date_bin(make_interval(secs=>period_seconds),clock_timestamp(),'2000-01-01'::timestamptz);
 insert into scit_private.request_budgets as b(subject,action,window_start,requests)
 values(subject,action,start_at,1)
 on conflict on constraint request_budgets_pkey do update set requests=b.requests+1
 returning requests into used;
 delete from scit_private.request_budgets where window_start<clock_timestamp()-interval '2 days';
 if used>request_limit then
  return greatest(1,ceil(extract(epoch from start_at+make_interval(secs=>period_seconds)-clock_timestamp()))::integer);
 end if;
 return 0;
end $$;
revoke all on function scit_private.consume_request_budget(text,text) from public,anon,authenticated;
grant usage on schema scit_private to service_role;
grant execute on function scit_private.consume_request_budget(text,text) to service_role;
create or replace function public.scit_consume_request_budget(subject text,action text)
returns integer language sql security invoker set search_path = ''
as $$ select scit_private.consume_request_budget(subject,action) $$;
revoke all on function public.scit_consume_request_budget(text,text) from public,anon,authenticated;
grant execute on function public.scit_consume_request_budget(text,text) to service_role;
