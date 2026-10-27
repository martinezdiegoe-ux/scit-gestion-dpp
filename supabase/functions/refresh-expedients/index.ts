import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const projectUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const service = createClient(projectUrl, serviceKey);
const source = 'https://www.santafe.gov.ar/expedientes-web/';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
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
  if (req.method==='OPTIONS') return new Response(null,{headers:cors});
  if (req.method!=='POST') return reply({error:'Método inválido'},405);
  try {
    const body=await req.json();
    const cron = typeof body.cron_token==='string';
    let userClient;
    if (cron) {
      const {data,error}=await service.rpc('scit_verify_expedient_cron_token',{provided:body.cron_token});
      if (error || data!==true) return reply({error:'No autorizado'},401);
    } else {
      const authorization=req.headers.get('Authorization')||'';
      const token=authorization.replace(/^Bearer\s+/i,'');
      if (!token) return reply({error:'Sesión requerida'},401);
      userClient=createClient(projectUrl,anonKey,{global:{headers:{Authorization:authorization}}});
      const {data:{user},error}=await userClient.auth.getUser(token);
      if (error || !user) return reply({error:'Sesión inválida'},401);
      const {data:profile,error:pe}=await userClient.from('profiles').select('role,active').eq('id',user.id).single();
      if (pe || !profile?.active || !['director','coordinador','administrativo'].includes(profile.role)) return reply({error:'Sin permiso de actualización'},403);
      if (body.id && typeof body.id!=='string') return reply({error:'ID inválido'},400);
    }
    const db=cron?service:userClient!;
    const list=db.from('tracked_expedients').select('id,number,kind,status').eq('status','ACTIVO');
    if (!cron) list.eq('id',body.id||'00000000-0000-0000-0000-000000000000');
    const {data:rows,error}=await list;
    if (error) throw error;
    if (!cron && rows?.length!==1) return reply({error:'Expediente no encontrado'},404);
    const results=[];
    for (const row of (rows||[]) as Row[]) {
      try {
        const request=queryRequest(row);
        const response=await fetch(request.url,{method:'POST',body:request.body,
          headers:{'Accept':'text/html','Content-Type':'application/x-www-form-urlencoded'},signal:AbortSignal.timeout(12000)});
        if (!response.ok) throw Error(`Consulta oficial: HTTP ${response.status}`);
        const fields=parse(await response.text(),row.number);
        const {error:ue}=await db.from('tracked_expedients').update({...fields,last_checked_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()}).eq('id',row.id);
        if (ue) throw ue;
        results.push({id:row.id,ok:true});
      } catch (e) {
        const raw=e instanceof Error?e.message:String(e);
        const message=/timed out|timeout|abort/i.test(raw)
          ? 'El sitio de expedientes de Santa Fe no respondió al servidor. Abrí «Ver fuente» y registrá el último pase con «Editar datos»; la consulta automática se reintentará.'
          : raw;
        await db.from('tracked_expedients').update({last_error:message}).eq('id',row.id);
        results.push({id:row.id,ok:false,error:message});
      }
    }
    return reply({results});
  } catch(e) { return reply({error:e instanceof Error?e.message:String(e)},500); }
});
