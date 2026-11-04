import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import {HttpError,corsHeaders,jsonReply,readJson,consumeBudget} from '../_shared/security.ts';

const projectUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const service = createClient(projectUrl, serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const source = 'https://www.santafe.gov.ar/expedientes-web/';
type Row = { id:string; number:string; kind:'PAPEL'|'DIGITAL'; status:string };

function text(html: string) {
  return html.replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ').trim();
}
function parse(html:string, number:string) {
  const section = html.match(/<div class="ui-bg-2">([\s\S]*)/i)?.[1] ?? html;
  const listedNumber = number.startsWith('EE-') ? number : number.replace(/-/g, ' - ');
  if (!text(section).includes(`Expediente: ${listedNumber}`)) throw Error('La consulta oficial no devolvió el expediente solicitado');
  const field = (label:string) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = section.match(new RegExp(`<div[^>]*>\\s*${escaped}:?\\s*<\\/div>\\s*<div[^>]*>([\\s\\S]*?)<\\/div>`, 'i'));
    if (!match) return null;
    const continuation = ['Remitente','Destino'].includes(label)
      ? section.slice((match.index||0)+match[0].length).match(/^\s*<\/div>\s*<div class="row">\s*<div[^>]*style="float:right;"[^>]*>([\s\S]*?)<\/div>/i)?.[1]
      : null;
    return [text(match[1]),continuation&&text(continuation)].filter(Boolean).join(' - ');
  };
  const rawDate = field('Fecha pase');
  if (!rawDate || !field('Destino')) throw Error('La respuesta oficial no incluye el último pase');
  const date = (value:string|null) => {
    const m=value?.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
    if (!m) return null;
    return `${m[3]}-${m[2]}-${m[1]}T${m[4]||'12'}:${m[5]||'00'}:00-03:00`;
  };
  return { topic:field('Tema'), concept:field('Concepto'), originator:field('Iniciador'),
    started_at:date(field('Fecha inicio')), current_office:field('Destino'),
    previous_office:field('Remitente'), last_transfer_at:date(rawDate) };
}
function queryRequest(row:Row) {
  if (row.kind==='PAPEL') {
    const m=row.number.match(/^(\d{3,8})-(\d{1,12})-(\d)$/);
    if (!m) throw Error('Formato papel inválido');
    return {url:`${source}sie`,body:new URLSearchParams({mesa:m[1],numero:m[2],digito:m[3],iniciar:'Buscar'})};
  }
  if (!/^EE-\d{4}-\d{8}-APPSF-[A-Z0-9]+$/.test(row.number)) throw Error('Formato digital inválido');
  const [,year,number,office]=row.number.match(/^EE-(\d{4})-(\d{8})-APPSF-([A-Z0-9]+)$/)!;
  return {url:`${source}expediente-timbo/`,body:new URLSearchParams({anioTimbo:year,numeroTimbo:number,tipoReparticion:'APPSF',reparticionTimbo:office,tipoTimbo:'EX',buscarTimbo:'Buscar'})};
}
Deno.serve(async req => {
  let headers:Record<string,string>={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  try {
    headers=corsHeaders(req);
    if(req.method==='OPTIONS')return new Response(null,{headers});
    if(req.method!=='POST')throw new HttpError(405,'Método no permitido');
    const body=await readJson(req);
    const cron=typeof body.cron_token==='string';
    let userClient;
    if(cron){
      const {data,error}=await service.rpc('scit_verify_expedient_cron_token',{provided:body.cron_token});
      if(error||data!==true)throw new HttpError(401,'No autorizado');
      await consumeBudget(service,'cron','refresh-expedients-cron');
    }else{
      const authorization=req.headers.get('Authorization')||'';
      const token=authorization.match(/^Bearer\s+(\S+)$/i)?.[1];
      if(!token)throw new HttpError(401,'Sesión requerida');
      userClient=createClient(projectUrl,anonKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
      const {data:{user},error}=await userClient.auth.getUser(token);
      if(error||!user)throw new HttpError(401,'Sesión inválida');
      const {data:role,error:pe}=await userClient.rpc('my_role');
      if(pe||!['director','coordinador','administrativo'].includes(role))throw new HttpError(403,'Sin permiso de actualización');
      await consumeBudget(service,user.id,'refresh-expedients');
      if(typeof body.id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id))throw new HttpError(400,'ID inválido');
    }
    const db=cron?service:userClient!;
    const list=db.from('tracked_expedients').select('id,number,kind,status').eq('status','ACTIVO');
    if(!cron)list.eq('id',body.id);
    const {data:rows,error}=await list;
    if(error)throw new HttpError(503,'No se pudieron consultar los expedientes');
    if(!cron&&rows?.length!==1)throw new HttpError(404,'Expediente no encontrado');
    const results=[];
    for(const row of (rows||[]) as Row[]){
      try{
        const request=queryRequest(row);
        const response=await fetch(request.url,{method:'POST',body:request.body,
          headers:{'Accept':'text/html','Content-Type':'application/x-www-form-urlencoded'},signal:AbortSignal.timeout(12000)});
        if(!response.ok)throw Error('Consulta oficial no disponible');
        const fields=parse(await response.text(),row.number);
        const {error:ue}=await db.from('tracked_expedients').update({...fields,last_checked_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()}).eq('id',row.id);
        if(ue)throw ue;
        results.push({id:row.id,ok:true});
      }catch{
        const message='No se pudo verificar el último pase en la fuente oficial. Abrí «Ver fuente» para comprobarlo y registrarlo manualmente.';
        await db.from('tracked_expedients').update({last_error:message}).eq('id',row.id);
        results.push({id:row.id,ok:false,error:message});
      }
    }
    return jsonReply({results},200,headers);
  }catch(e){
    const failure=e instanceof HttpError?e:new HttpError(500,'No se pudo procesar la actualización');
    return jsonReply({error:failure.message},failure.status,headers,failure.retryAfter);
  }
});
