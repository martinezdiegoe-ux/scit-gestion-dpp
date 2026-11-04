-- An internal application accepts accounts only through an administrator invitation.
-- invited_at is set by Supabase Auth, never by user-editable metadata.
create or replace function scit_private.require_institutional_invitation()
returns trigger language plpgsql security invoker set search_path = ''
as $$ begin
 if new.invited_at is null then
  raise exception 'El registro público está deshabilitado. Solicitá una invitación institucional.' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function scit_private.require_institutional_invitation() from public,anon,authenticated;
create trigger scit_require_invitation before insert on auth.users
for each row execute function scit_private.require_institutional_invitation();
create policy request_budgets_deny_clients on scit_private.request_budgets
for all to anon,authenticated using(false) with check(false);
