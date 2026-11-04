import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {HttpError,corsHeaders,jsonReply,readJson,consumeBudget} from '../_shared/security.ts';

Deno.serve(async(req:Request)=>{
 let headers:Record<string,string>={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 try {
  headers=corsHeaders(req);
  if(req.method==='OPTIONS')return new Response(null,{headers});
  if(req.method!=='POST')throw new HttpError(405,'Método no permitido');
  const token=req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if(!token)throw new HttpError(401,'Sesión requerida');
  const url=Deno.env.get('SUPABASE_URL')!;
  const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await admin.auth.getUser(token);
  if(authError||!user)throw new HttpError(401,'Sesión inválida');
  const client=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:role,error:roleError}=await client.rpc('my_role');
  if(roleError||role!=='director')throw new HttpError(403,'Solo un Director con sesión vigente puede invitar usuarios');
  await consumeBudget(admin,user.id,'invite-user');
  const body=await readJson(req);
  const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
  const fullName=typeof body.full_name==='string'?body.full_name.trim():'';
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!fullName||fullName.length>150)
   throw new HttpError(400,'Nombre o correo inválido');
  const {error}=await admin.auth.admin.inviteUserByEmail(email,{data:{full_name:fullName},redirectTo:'https://martinezdiegoe-ux.github.io/scit-gestion-dpp/'});
  if(error)throw new HttpError(400,'No se pudo crear la invitación. Revisá el correo o los límites de envío.');
  return jsonReply({ok:true,approval_required:true},200,headers);
 } catch(e) {
  const failure=e instanceof HttpError?e:new HttpError(500,'No se pudo procesar la invitación');
  return jsonReply({error:failure.message},failure.status,headers,failure.retryAfter);
 }
});
