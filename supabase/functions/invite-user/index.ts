import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
const allowed=['https://martinezdiegoe-ux.github.io','http://localhost:5173'];
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'';
 const headers={'Access-Control-Allow-Origin':allowed.includes(origin)?origin:allowed[0],
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST'||(origin&&!allowed.includes(origin)))return new Response(JSON.stringify({error:'Solicitud inválida'}),{status:403,headers});
 try{
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');
  if(!token)throw Error('Falta autenticación');
  const admin=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',
   {auth:{autoRefreshToken:false,persistSession:false}});
  const{data:{user},error:userError}=await admin.auth.getUser(token);
  if(userError||!user)return new Response(JSON.stringify({error:'Sesión inválida'}),{status:401,headers});
  const{data:profile,error:profileError}=await admin.from('profiles').select('role,active').eq('id',user.id).single();
  if(profileError||!profile?.active||profile.role!=='director')return new Response(JSON.stringify({error:'Solo el Director puede invitar usuarios'}),{status:403,headers});
  const body=await req.json();
  const email=String(body.email||'').trim().toLowerCase();
  const fullName=String(body.full_name||'').trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!fullName||fullName.length>150)
   return new Response(JSON.stringify({error:'Nombre o correo inválido'}),{status:400,headers});
  const{error}=await admin.auth.admin.inviteUserByEmail(email,{data:{full_name:fullName},redirectTo:'https://martinezdiegoe-ux.github.io/scit-gestion-dpp/'});
  if(error)throw error;
  return new Response(JSON.stringify({ok:true}),{headers});
 }catch(e){return new Response(JSON.stringify({error:e instanceof Error?e.message:'Error interno'}),{status:400,headers})}
});
