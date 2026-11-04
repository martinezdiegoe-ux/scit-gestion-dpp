begin;
create temp table security_test_identity as
 select p.id as uid,gen_random_uuid() as sid from public.profiles p where p.active and p.role='lectura' limit 1;
create temp table security_test_results(name text,passed boolean);
grant select on security_test_identity to authenticated;
grant insert,select on security_test_results to authenticated;
insert into auth.sessions(id,user_id,created_at,updated_at,aal)
 select sid,uid,now(),now(),'aal1' from security_test_identity;
select set_config('request.jwt.claim.sub',(select uid::text from security_test_identity),true);
select set_config('request.jwt.claims',(select json_build_object('sub',uid,'session_id',sid,'role','authenticated')::text from security_test_identity),true);
set local role authenticated;
insert into security_test_results select 'approved_reader_can_read',count(*)>0 from public.interns;
with affected as (update public.profiles set role='director' where id=auth.uid() returning id)
 insert into security_test_results select 'reader_cannot_promote_self',count(*)=0 from affected;
insert into security_test_results values('reader_cannot_consume_server_budget',not has_function_privilege(current_user,'public.scit_consume_request_budget(text,text)','EXECUTE'));
reset role;
update auth.sessions set created_at=now()-interval '13 hours' where id=(select sid from security_test_identity);
set local role authenticated;
insert into security_test_results select 'expired_session_reads_nothing',count(*)=0 from public.interns;
reset role;
update auth.sessions set created_at=now() where id=(select sid from security_test_identity);
update public.profiles set active=false where id=(select uid from security_test_identity);
set local role authenticated;
insert into security_test_results select 'unapproved_reader_reads_nothing',count(*)=0 from public.interns;
reset role;
insert into auth.users(id,email,invited_at,raw_user_meta_data)
values(gen_random_uuid(),'security-rollback-test@example.invalid',now(),'{"full_name":"Security rollback test","role":"director","active":true}'::jsonb);
insert into security_test_results select 'new_user_is_pending_despite_metadata',not p.active and p.role='lectura'
 from public.profiles p join auth.users u on p.id=u.id where u.email='security-rollback-test@example.invalid';

do $$ begin
 begin
  insert into auth.users(id,email,raw_user_meta_data)
  values(gen_random_uuid(),'security-denied-signup@example.invalid','{"invited_at":"2026-01-01","role":"director"}'::jsonb);
  raise exception 'Uninvited signup was accepted';
 exception when insufficient_privilege then null;
 end;
end $$;
insert into security_test_results values('public_signup_is_rejected',not exists(select 1 from auth.users where email='security-denied-signup@example.invalid'));

select public.scit_consume_request_budget('security-rollback-test','invite-user') from generate_series(1,5);
insert into security_test_results select 'sixth_invitation_is_rate_limited',public.scit_consume_request_budget('security-rollback-test','invite-user')>0;
do $$ begin if exists(select 1 from security_test_results where not passed) then raise exception 'Security regression test failed'; end if; end $$;
select jsonb_agg(to_jsonb(r)) as tests from security_test_results r;
rollback;
