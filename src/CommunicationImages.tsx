import {useEffect,useRef,useState} from 'react';
import {ImagePlus,RefreshCw,X} from 'lucide-react';
import {Editor,type Field} from './Editor';
import {supabase} from './lib/supabase';
import type {Row} from './lib/data';
import {COMMUNICATION_BUCKET,IMAGE_ACCEPT,MAX_IMAGE_BYTES,persistCommunicationItem,uploadCommunicationImages,uploadMessage,type UploadInput,type UploadProgress} from './lib/communicationAssets';

export function ImagePicker({label='Cargar imágenes',description,disabled=false,onSelect}:{label?:string;description:string;disabled?:boolean;onSelect:(files:File[])=>void}){
 const input=useRef<HTMLInputElement>(null);
 return <div className="commImagePicker"><button type="button" className="primary" disabled={disabled} aria-label={description} onClick={()=>input.current?.click()}><ImagePlus size={17}/>{label}</button><input ref={input} className="commFileInput" tabIndex={-1} aria-label={description} type="file" multiple accept={IMAGE_ACCEPT} disabled={disabled} onChange={event=>{const files=Array.from(event.currentTarget.files||[]);event.currentTarget.value='';if(files.length)onSelect(files)}}/></div>;
}
export function UploadStatus({progress}:{progress:UploadProgress}){
 return <div className="commUploadStatus" role="status" aria-live="polite"><span>Procesando {Math.min(progress.completed+1,progress.total)} de {progress.total}: {progress.name}</span><progress aria-label="Avance de carga de imágenes" max={progress.total} value={progress.completed}/><small>Esperá a que termine la carga.</small></div>;
}
export function CommunicationImage({asset}:{asset:Row}){
 const [url,setUrl]=useState(''),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{
  let alive=true,objectUrl='';setUrl('');setError(false);
  async function load(){
   try{if(!supabase)throw Error();const {data,error}=await supabase.storage.from(COMMUNICATION_BUCKET).download(asset.storage_path);if(error||!data)throw error;objectUrl=URL.createObjectURL(data);if(alive)setUrl(objectUrl);else URL.revokeObjectURL(objectUrl);}
   catch{if(alive)setError(true);}
  }
  void load();return()=>{alive=false;if(objectUrl)URL.revokeObjectURL(objectUrl)};
 },[asset.storage_path,retry]);
 if(error)return <div className="commImagePlaceholder"><span>No se pudo mostrar la imagen.</span><button type="button" className="ghost" onClick={()=>setRetry(value=>value+1)}><RefreshCw size={14}/>Volver a cargar</button></div>;
 return url?<img src={url} alt={asset.file_name} loading="lazy" onError={()=>setError(true)}/>:<div className="commImagePlaceholder" role="status">Cargando imagen…</div>;
}

type Draft=UploadInput&{preview:string;uploaded?:boolean;error?:string};
export function CommunicationEditor({initial,fields,onClose,onUploaded,onSaved,reload}:{initial:Row;fields:Field[];onClose:()=>void;onUploaded:(row:Row)=>void;onSaved:(row:Row)=>void;reload:()=>Promise<void>}){
 const [id]=useState<string>(()=>initial.id||crypto.randomUUID());
 const [isNew]=useState(()=>!initial.id);
 const [drafts,setDrafts]=useState<Draft[]>([]),[processing,setProcessing]=useState(false),[selectionError,setSelectionError]=useState(''),[progress,setProgress]=useState<UploadProgress|null>(null);
 const previews=useRef(new Set<string>());
 useEffect(()=>()=>{previews.current.forEach(url=>URL.revokeObjectURL(url));previews.current.clear()},[]);
 function select(files:File[]){
  const next:Draft[]=[],errors:string[]=[];
  for(const file of files){
   if(!file.size||file.size>MAX_IMAGE_BYTES){errors.push(`${file.name}: ${file.size?'supera los 15 MB':'está vacío'}.`);continue;}
   const preview=URL.createObjectURL(file);previews.current.add(preview);next.push({key:crypto.randomUUID(),file,preview});
  }
  setDrafts(current=>[...current,...next]);setSelectionError(errors.join(' '));
 }
 function remove(key:string){setDrafts(current=>current.filter(draft=>{if(draft.key!==key)return true;URL.revokeObjectURL(draft.preview);previews.current.delete(draft.preview);return false}))}
 async function save(row:Row){
  if(!supabase)throw Error('No hay conexión con la aplicación.');
  setProcessing(true);setSelectionError('');
  try{
   const item=await persistCommunicationItem(supabase,row,id,isNew);
   const pending=drafts.filter(draft=>!draft.uploaded);
   const results=pending.length?await uploadCommunicationImages(supabase,item.id,pending,{onProgress:setProgress,onUploaded:asset=>{onUploaded(asset);setDrafts(current=>current.map(draft=>draft.key===asset.id?{...draft,uploaded:true,error:undefined}:draft))}}):[];
   setDrafts(current=>current.map(draft=>{const result=results.find(result=>result.key===draft.key);return result?{...draft,uploaded:!!result.row,error:result.error}:draft}));
   await reload();onSaved(item);
   const failures=results.filter(result=>result.error);
   if(failures.length)throw Error(`La actividad quedó guardada. ${failures.length} ${failures.length===1?'imagen no se pudo cargar':'imágenes no se pudieron cargar'}. Revisá el detalle y presioná Guardar para reintentar las pendientes.`);
  }finally{setProcessing(false);setProgress(null)}
 }
 return <Editor title={initial.id?'Editar actividad':'Nueva actividad'} fields={fields} initial={initial} onClose={onClose} onSave={save} submitLabel={drafts.some(draft=>!draft.uploaded)?'Guardar actividad e imágenes':'Guardar actividad'} savingLabel={progress?`Cargando imágenes (${progress.completed}/${progress.total})…`:'Guardando…'}>
  <section className="commEditorImages" aria-label="Imágenes de la actividad"><h3>Imágenes de la actividad</h3><p>Elegí una o varias imágenes JPG, PNG o WebP. Hasta 15 MB por archivo. Se adjuntan al guardar.</p><ImagePicker label="Seleccionar imágenes" description="Seleccionar imágenes para esta actividad" disabled={processing} onSelect={select}/>
   {selectionError&&<p className="error" role="alert">{selectionError}</p>}
   <div className="commDraftImages">{drafts.map(draft=><article key={draft.key}><img src={draft.preview} alt={`Vista previa de ${draft.file.name}`} loading="lazy"/><strong>{draft.file.name}</strong><small>{draft.uploaded?'Cargada':`${(draft.file.size/1024/1024).toFixed(1)} MB · Pendiente`}</small>{draft.error&&<p className="error" role="alert">{draft.error}</p>}{!draft.uploaded&&<button type="button" className="ghost" disabled={processing} onClick={()=>remove(draft.key)} aria-label={`Quitar ${draft.file.name} de la selección`}><X size={14}/>Quitar</button>}</article>)}</div>
   {progress&&<UploadStatus progress={progress}/>}
  </section>
 </Editor>;
}
