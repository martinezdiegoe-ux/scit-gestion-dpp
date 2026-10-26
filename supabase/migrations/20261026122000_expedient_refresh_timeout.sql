-- Concede tiempo para la consulta externa sin alterar la frecuencia diaria.
select cron.unschedule('scit-expedientes-08-arg');
select cron.unschedule('scit-expedientes-13-arg');
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
