const allowedOrigin = 'https://martinezdiegoe-ux.github.io';

export class HttpError extends Error {
 status:number; retryAfter?:number;
 constructor(status:number,message:string,retryAfter?:number){super(message);this.status=status;this.retryAfter=retryAfter;}
}
export function corsHeaders(req: Request): Record<string,string> {
 const origin = req.headers.get('origin');
 if (origin && origin !== allowedOrigin) throw new HttpError(403,'Origen no autorizado');
 return {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
 };
}
export function jsonReply(data: unknown,status: number,headers: Record<string,string>,retryAfter?: number) {
 return new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json',...(retryAfter?{'Retry-After':String(retryAfter)}:{})}});
}
export async function readJson(req: Request): Promise<Record<string,unknown>> {
 if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json') throw new HttpError(415,'Se requiere JSON');
 if (Number(req.headers.get('content-length'))>8192) throw new HttpError(413,'Solicitud demasiado grande');
 const reader=req.body?.getReader();
 if(!reader)throw new HttpError(400,'Faltan datos');
 const decoder=new TextDecoder();let size=0,text='';
 try {
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
   if(size>8192){await reader.cancel();throw new HttpError(413,'Solicitud demasiado grande');}
   text+=decoder.decode(value,{stream:true});
  }
  text+=decoder.decode();
 } finally { reader.releaseLock(); }
 try {const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}
 catch {throw new HttpError(400,'Datos inválidos');}
}
type BudgetClient={rpc:(name:string,args:Record<string,string>)=>PromiseLike<{data:unknown;error:unknown}>};
export async function consumeBudget(client:BudgetClient,subject:string,action:string) {
 const {data,error}=await client.rpc('scit_consume_request_budget',{subject,action});
 if(error||typeof data!=='number')throw new HttpError(503,'Servicio temporalmente no disponible');
 if(data>0)throw new HttpError(429,'Demasiadas solicitudes. Intentá nuevamente más tarde.',data);
}
