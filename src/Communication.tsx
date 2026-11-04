import {useEffect,useMemo,useRef,useState} from 'react';
import {CalendarDays,ChevronLeft,ChevronRight,Download,RefreshCw} from 'lucide-react';
import type {DataState,Row} from './lib/data';
import {dateText,type Field} from './Editor';
import {supabase} from './lib/supabase';

type Props={data:DataState;canEdit:boolean;reload:()=>Promise<void>};
import {CommunicationEditor,CommunicationImage,ImagePicker,UploadStatus} from './CommunicationImages';
import {COMMUNICATION_BUCKET as bucket,uploadCommunicationImages,uploadMessage,type UploadInput,type UploadProgress} from './lib/communicationAssets';
const pad=(n:number)=>String(n).padStart(2,'0');
const dateKey=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const monthKey=(d:Date)=>dateKey(d).slice(0,7);
const typeLabel=(v?:string)=>v==='PUBLICACION_RRSS'?'Publicación RRSS':v==='COBERTURA_EVENTO'?'Cobertura institucional':v||'Acción';
const statusLabel=(v?:string)=>({'PLANIFICADO':'Planificado','EN_DISENO':'En diseño','EN_APROBACION':'En revisión','PUBLICADO':'Publicado','CANCELADO':'Cancelado'} as Record<string,string>)[v||'']||v||'Planificado';
const fields:Field[]=[
 {key:'title',label:'Título o actividad',required:true},
 {key:'item_type',label:'Tipo',required:true,options:[{value:'PUBLICACION_RRSS',label:'Publicación para redes sociales'},{value:'COBERTURA_EVENTO',label:'Cobertura de evento institucional'}]},
 {key:'target_date',label:'Fecha',type:'date',required:true},{key:'target_time',label:'Hora',type:'time'},
 {key:'location',label:'Lugar'},{key:'channel',label:'Red, medio o canal'},
 {key:'responsible',label:'Responsable'},{key:'audience',label:'Destinatarios'},
 {key:'status',label:'Estado',options:['PLANIFICADO','EN_DISENO','EN_APROBACION','PUBLICADO','CANCELADO'].map(value=>({value,label:statusLabel(value)}))},
 {key:'approval_by',label:'Revisión o aprobación por'},{key:'links',label:'Enlaces de publicación'},{key:'notes',label:'Descripción / observaciones',type:'textarea'}
];
export default function Communication({data,canEdit,reload}:Props){
 const today=dateKey(new Date());
 const[month,setMonth]=useState(()=>monthKey(new Date()));
 const[day,setDay]=useState<string|null>(null),[type,setType]=useState(''),[editor,setEditor]=useState<Row|null|false>(false);
 const[expanded,setExpanded]=useState<string|null>(null),[assets,setAssets]=useState<Row[]>([]),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const [notice,setNotice]=useState(''),[progress,setProgress]=useState<UploadProgress|null>(null),[failed,setFailed]=useState<Record<string,UploadInput[]>>({});
 const uploadLock=useRef(false);
 const addAsset=(row:Row)=>setAssets(current=>[row,...current.filter(asset=>asset.id!==row.id)]);
 const items=useMemo(()=>[...data.communication].sort((a,b)=>`${a.target_date||'9999'} ${a.target_time||''}`.localeCompare(`${b.target_date||'9999'} ${b.target_time||''}`)),[data.communication]);
 const filtered=items.filter(i=>!type||i.item_type===type);
 const [year,m]=month.split('-').map(Number);
 const first=new Date(year,m-1,1),lastDay=new Date(year,m,0).getDate(),offset=(first.getDay()+6)%7;
 const days=Array.from({length:Math.ceil((offset+lastDay)/7)*7},(_,index)=>{const n=index-offset+1;return n>=1&&n<=lastDay?`${month}-${pad(n)}`:null});
 const monthItems=filtered.filter(i=>i.target_date?.startsWith(month));
 const dayItems=day?filtered.filter(i=>i.target_date===day):monthItems;
 const upcoming=filtered.filter(i=>i.target_date>=today&&i.status!=='CANCELADO').slice(0,3);
 const monthTitle=first.toLocaleDateString('es-AR',{month:'long',year:'numeric'});
 function changeMonth(delta:number){const d=new Date(year,m-1+delta,1);setMonth(monthKey(d));setDay(null)}
 useEffect(()=>{let live=true;async function load(){if(!supabase)return;const{data:rows,error}=await supabase.from('communication_assets').select('*').order('created_at',{ascending:false});if(live){if(error)setError(error.message);else setAssets(rows||[])}}void load();return()=>{live=false}},[data.communication]);
 async function upload(item:Row,inputs:UploadInput[]){
  if(!supabase||!inputs.length||uploadLock.current)return;
  uploadLock.current=true;setBusy(item.id);setExpanded(item.id);setError('');setNotice('');
  try{
   const results=await uploadCommunicationImages(supabase,item.id,inputs,{onProgress:setProgress,onUploaded:addAsset});
   const failures=results.filter(result=>result.error);
   setFailed(current=>({...current,[item.id]:[...(current[item.id]||[]).filter(old=>!inputs.some(input=>input.key===old.key)),...failures]}));
   const count=results.length-failures.length;
   if(count)setNotice(`${count} ${count===1?'imagen cargada':'imágenes cargadas'} en «${item.title}».`);
   if(failures.length)setError(failures.map(result=>`${result.file.name}: ${result.error}`).join(' '));
   await reload();
  }catch(error){setError(error instanceof Error?error.message:uploadMessage(error));setFailed(current=>({...current,[item.id]:[...(current[item.id]||[]).filter(old=>!inputs.some(input=>input.key===old.key)),...inputs]}));}
  finally{setBusy('');setProgress(null);uploadLock.current=false;}
 }
 async function review(asset:Row,value:string){if(!supabase)return;const{error}=await supabase.from('communication_assets').update({review_status:value}).eq('id',asset.id);if(error)setError(error.message);else setAssets(old=>old.map(a=>a.id===asset.id?{...a,review_status:value}:a))}
 async function download(asset:Row){if(!supabase)return;const{data,error}=await supabase.storage.from(bucket).download(asset.storage_path);if(error){setError(error.message);return}const url=URL.createObjectURL(data);const a=document.createElement('a');a.href=url;a.download=asset.file_name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}
 async function remove(asset:Row){
  if(!supabase||!window.confirm(`¿Quitar ${asset.file_name} de esta actividad?`))return;
  setError('');setNotice('');
  const {error:storageError}=await supabase.storage.from(bucket).remove([asset.storage_path]);
  if(storageError){setError('No se pudo quitar el archivo. Reintentá cuando tengas conexión.');return;}
  const {error}=await supabase.from('communication_assets').delete().eq('id',asset.id);
  if(error){setError('El archivo se quitó, pero falta actualizar su registro. Presioná Quitar nuevamente para completar la eliminación.');return;}
  setAssets(current=>current.filter(item=>item.id!==asset.id));setNotice('Imagen quitada de la actividad.');
 }
 const card=(item:Row)=><article className="commItem" key={item.id}>
  <div className="commItemTop"><span className={'commKind '+(item.item_type==='COBERTURA_EVENTO'?'coverage':'social')}>{typeLabel(item.item_type)}</span><small>{statusLabel(item.status)}</small></div>
  <h3>{item.title}</h3><p>{dateText(item.target_date)}{item.target_time?` · ${String(item.target_time).slice(0,5)} h`:''}{item.location?` · ${item.location}`:''}</p>
  {item.responsible&&<small>Responsable: {item.responsible}</small>}{item.channel&&<small>Canal: {item.channel}</small>}
  <div className="commActions">{canEdit&&<ImagePicker description={`Cargar imágenes para ${item.title}`} disabled={!!busy} onSelect={files=>void upload(item,files.map(file=>({key:crypto.randomUUID(),file})))}/>}
   <button type="button" className="ghost" aria-expanded={expanded===item.id} onClick={()=>setExpanded(value=>value===item.id?null:item.id)}>{expanded===item.id?'Ocultar imágenes':'Ver imágenes'} ({assets.filter(asset=>asset.item_id===item.id).length})</button>
   {canEdit&&<button type="button" className="ghost" disabled={!!busy} onClick={()=>setEditor(item)}>Editar actividad</button>}
  </div>
  {progress&&busy===item.id&&<UploadStatus progress={progress}/>}
  {!!failed[item.id]?.length&&canEdit&&<button type="button" className="ghost commRetry" disabled={!!busy} onClick={()=>void upload(item,failed[item.id])}><RefreshCw size={15}/>Reintentar {failed[item.id].length} {failed[item.id].length===1?'imagen pendiente':'imágenes pendientes'}</button>}
  {expanded===item.id&&<div className="commAssetPanel"><p className="muted">Imágenes privadas para revisión y respaldo de la publicación. JPG, PNG o WebP de hasta 15 MB.</p>
   <div className="commImages">{assets.filter(asset=>asset.item_id===item.id).map(asset=><div className="commImage" key={asset.id}><CommunicationImage asset={asset}/><strong>{asset.file_name}</strong><span>{({'EN_REVISION':'En revisión','APROBADA':'Aprobada','DESCARTADA':'Descartada'} as Record<string,string>)[asset.review_status]}</span>
    <div className="commActions"><button type="button" className="ghost" onClick={()=>void download(asset)}><Download size={15}/>Descargar</button>{canEdit&&<><select aria-label={`Revisión de ${asset.file_name}`} value={asset.review_status} disabled={!!busy} onChange={event=>void review(asset,event.target.value)}><option value="EN_REVISION">En revisión</option><option value="APROBADA">Aprobada</option><option value="DESCARTADA">Descartada</option></select><button type="button" className="ghost" disabled={!!busy} onClick={()=>void remove(asset)}>Quitar</button></>}</div>
   </div>)}</div>
   {!assets.some(asset=>asset.item_id===item.id)&&!busy&&<p className="muted">Todavía no hay imágenes adjuntas.{canEdit?' Usá Cargar imágenes o adjuntalas desde Editar actividad.':''}</p>}
  </div>}
 </article>;
 return <div className="communicationPage"><section className="card commIntro"><div className="titleRow"><div><span className="eyebrow">SCIT · COMUNICACIÓN</span><h2>Cronograma institucional</h2><p>Publicaciones para redes y cobertura de reuniones, convenios y actividades provinciales.</p></div>{canEdit&&<button className="primary" disabled={!!busy} onClick={()=>setEditor({item_type:'PUBLICACION_RRSS',status:'PLANIFICADO',target_date:day||today})}>+ Nueva actividad</button>}</div><div className="regionPills" aria-label="Tipo de actividad">{[['','Todas'],['PUBLICACION_RRSS','RRSS'],['COBERTURA_EVENTO','Coberturas']].map(([value,label])=><button key={value} className={type===value?'active':''} onClick={()=>setType(value)}>{label}</button>)}</div></section>
 {!canEdit&&<p className="muted">Tu cuenta permite consultar imágenes. Para cargar o editar necesitás permisos de gestión.</p>}
 <section className="card commUpcoming"><h2>Próximas 3 actividades</h2>{upcoming.length?<div className="commUpcomingList">{upcoming.map(item=><button key={item.id} onClick={()=>{setMonth(item.target_date.slice(0,7));setDay(item.target_date);setExpanded(item.id)}}><b>{dateText(item.target_date)}{item.target_time?` · ${String(item.target_time).slice(0,5)}`:''}</b><span>{item.title}</span><small>{typeLabel(item.item_type)}</small></button>)}</div>:<p className="muted">No hay próximas actividades cargadas.</p>}</section>
 <section className="card commCalendar"><div className="commMonthHead"><div><CalendarDays size={20}/><h2>{monthTitle}</h2></div><div className="commMonthControls"><button className="ghost" aria-label="Mes anterior" onClick={()=>changeMonth(-1)}><ChevronLeft size={19}/></button><input type="month" aria-label="Elegir mes" value={month} onChange={e=>{if(e.target.value){setMonth(e.target.value);setDay(null)}}}/><button className="ghost" aria-label="Mes siguiente" onClick={()=>changeMonth(1)}><ChevronRight size={19}/></button><button className="ghost" onClick={()=>{setMonth(monthKey(new Date()));setDay(null)}}>Hoy</button></div></div><div className="commWeekdays">{['L','M','M','J','V','S','D'].map((d,i)=><span key={i}>{d}</span>)}</div><div className="commDays">{days.map((key,index)=>key?<button key={key} className={`${key===today?'today':''} ${day===key?'selected':''}`} onClick={()=>setDay(v=>v===key?null:key)} aria-label={`${dateText(key)}, ${filtered.filter(i=>i.target_date===key).length} actividades`}><span>{Number(key.slice(-2))}</span><span className="commDots">{filtered.filter(i=>i.target_date===key).slice(0,3).map(i=><i key={i.id} className={i.item_type==='COBERTURA_EVENTO'?'coverage':'social'}/>)}</span></button>:<span key={'empty'+index}/>)}</div><div className="commLegend"><span><i className="social"/>Publicación RRSS</span><span><i className="coverage"/>Cobertura</span></div></section>
 <section className="card commSchedule"><div className="titleRow"><h2>{day?`Actividades del ${dateText(day)}`:`Actividades de ${monthTitle}`}</h2><span className="muted">{dayItems.length} registradas</span></div>{error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="commUploadNotice" role="status">{notice}</p>}{dayItems.length?<div className="commItems">{dayItems.map(card)}</div>:<p className="muted">No hay actividades para esta selección.</p>}{!day&&monthItems.length===0&&<p className="muted">Elegí otra fecha o cargá una actividad.</p>}</section>
 {editor!==false&&<CommunicationEditor initial={editor||{}} fields={fields} onClose={()=>setEditor(false)} onUploaded={addAsset} reload={reload} onSaved={item=>{setDay(item.target_date||null);if(item.target_date)setMonth(item.target_date.slice(0,7));setExpanded(item.id);setNotice('Actividad guardada.')}}/>}</div>
}
