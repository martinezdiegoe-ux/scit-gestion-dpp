export type OfficialResult={number:string;kind:'PAPEL'|'DIGITAL';topic:string|null;concept:string|null;originator:string|null;started_at:string|null;current_office:string;previous_office:string|null;last_transfer_at:string};

export function normalizeExpedient(value:string){return value.trim().toUpperCase().replace(/\.$/,'').replace(/\s*-\s*/g,'-')}
export function validExpedient(value:string){return /^\d{3,8}-\d{1,12}-\d$/.test(value)||/^EE-\d{4}-\d{8}-APPSF-[A-Z0-9]+$/.test(value)}
export function officialLink(number:string){const value=normalizeExpedient(number);if(value.startsWith('EE-'))return `https://www.santafe.gov.ar/expedientes-web/expediente-timbo/?expediente=${encodeURIComponent(value)}`;const [mesa,numero,digito]=value.split('-');return `https://www.santafe.gov.ar/expedientes-web/sie?mesa=${encodeURIComponent(mesa)}&numero=${encodeURIComponent(numero)}&digito=${encodeURIComponent(digito)}`}

export function parseOfficialExpedient(raw:string,expected:string):OfficialResult{
 const content=raw.replace(/\r/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
 const found=content.match(/Expediente:\s*(EE\s*-\s*\d{4}\s*-\s*\d{8}\s*-\s*APPSF\s*-\s*[A-Z0-9]+|\d{3,8}\s*-\s*\d{1,12}\s*-\s*\d)/i);
 if(!found)throw Error('Pegá el resultado que incluye “Expediente:” y el último pase.');
 const number=normalizeExpedient(found[1]);
 if(number!==normalizeExpedient(expected))throw Error('El resultado pertenece a otro expediente. Revisá el número antes de guardarlo.');
 const result=content.slice((found.index||0)+found[0].length);
 const field=(label:string,next:string)=>{
  const pattern=new RegExp(`${label}:?\\s*([\\s\\S]*?)(?=${next})`,'i');
  return result.match(pattern)?.[1]?.replace(/\s+/g,' ').trim()||null;
 };
 const originator=field('Iniciador','Fecha inicio:');
 const started=field('Fecha inicio','Tema:');
 const topic=field('Tema','Concepto:');
 const concept=field('Concepto','INFORMACIÓN DEL ÚLTIMO PASE');
 const pass=field('Fecha pase','(?:Folios:|Remitente:)');
 const sender=field('Remitente','Destino:');
 const destination=field('Destino','(?:Esta consulta incluye|Consulta de Estado de Expediente|Gob:|RSS /|$)');
 const date=(v:string|null)=>{const m=v?.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);return m?`${m[3]}-${m[2]}-${m[1]}T${m[4]||'12'}:${m[5]||'00'}:00-03:00`:null};
 const last_transfer_at=date(pass);
 if(!destination||!last_transfer_at)throw Error('Faltan el destino o la fecha del último pase. Copiá el resultado completo de la consulta oficial.');
 return {number,kind:number.startsWith('EE-')?'DIGITAL':'PAPEL',topic,concept,originator,started_at:date(started),current_office:destination,previous_office:sender,last_transfer_at};
}
