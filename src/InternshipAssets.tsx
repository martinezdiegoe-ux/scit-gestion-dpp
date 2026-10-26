import {useEffect,useState} from 'react';
import {Download,FileUp,Phone,UserRound} from 'lucide-react';
import type {Row} from './lib/data';
import {supabase} from './lib/supabase';

type Category='CONVOCATORIA'|'DESIGNACION'|'BAJA'|'CONVENIO_INICIAL'|'CONVENIO_RENOVACION'|'OTRO';
const categories:Record<Category,string>={CONVOCATORIA:'Resolución de convocatoria',DESIGNACION:'Resolución de designación',BAJA:'Resolución de baja',CONVENIO_INICIAL:'Convenio individual inicial',CONVENIO_RENOVACION:'Convenio de renovación',OTRO:'Otro documento'};
const bucket='scit-internships';
const safeName=(name:string)=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,90);
export default function InternshipAssets({slot,intern,assignment,terms,acts,canEdit,onEdit,onChanged}: {slot:Row;intern?:Row;assignment?:Row;terms:Row[];acts:Row[];canEdit:boolean;onEdit:()=>void;onChanged:()=>Promise<void>}){
 const[files,setFiles]=useState<Row[]>([]),[photo,setPhoto]=useState(''),[category,setCategory]=useState<Category>('CONVOCATORIA'),[title,setTitle]=useState(''),[uploading,setUploading]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let alive=true;async function load(){if(!supabase)return;const{data,error}=await supabase.from('internship_files').select('*').eq('slot_id',slot.id).order('created_at',{ascending:false});if(alive){if(error)setError(error.message);else setFiles(data||[])}}void load();return()=>{alive=false}},[slot.id]);
 useEffect(()=>{let alive=true;async function load(){if(!supabase||!intern?.photo_path){setPhoto('');return}const{data}=await supabase.storage.from(bucket).createSignedUrl(intern.photo_path,3600);if(alive)setPhoto(data?.signedUrl||'')}void load();return()=>{alive=false}},[intern?.photo_path]);
 const phone=String(intern?.phone||'').replace(/[^\d+]/g,'');
 const linked=[['CONVOCATORIA',assignment?.call_act_id],['DESIGNACION',assignment?.designation_act_id],['BAJA',assignment?.vacancy_act_id],...terms.map(t=>[t.kind==='INICIAL_12'?'CONVENIO_INICIAL':'CONVENIO_RENOVACION',t.act_id])] as [Category,string|undefined][];
 async function upload(file:File,kind:'document'|'photo'){
  if(!supabase)return;
  const valid=kind==='photo'?['image/jpeg','image/png','image/webp']:['application/pdf','image/jpeg','image/png','image/webp'];
  if(!valid.includes(file.type)||file.size>10*1024*1024){setError('Elegí un PDF o imagen válida de hasta 10 MB.');return}
  setUploading(true);setError('');const path=`${kind==='photo'?'photos':'documents'}/${kind==='photo'?intern?.id:slot.id}/${crypto.randomUUID()}-${safeName(file.name)}`;
  try{
   const{error:up}=await supabase.storage.from(bucket).upload(path,file,{contentType:file.type,upsert:false});if(up)throw up;
   try{
    if(kind==='photo'){
     const{error:save}=await supabase.from('interns').update({photo_path:path}).eq('id',intern!.id);if(save)throw save;
     const{data}=await supabase.storage.from(bucket).createSignedUrl(path,3600);setPhoto(data?.signedUrl||'');await onChanged();
    }else{
     const term=category==='CONVENIO_INICIAL'?terms.find(t=>t.kind==='INICIAL_12'):category==='CONVENIO_RENOVACION'?terms.find(t=>t.kind==='RENOVACION_6'):undefined;
     const actId=category==='CONVOCATORIA'?assignment?.call_act_id:category==='DESIGNACION'?assignment?.designation_act_id:category==='BAJA'?assignment?.vacancy_act_id:term?.act_id;
     const{data,error:save}=await supabase.from('internship_files').insert({slot_id:slot.id,intern_id:intern?.id||null,assignment_id:assignment?.id||null,act_id:actId||null,term_id:term?.id||null,category,title:title.trim()||file.name,storage_path:path,uploaded_by:(await supabase.auth.getUser()).data.user?.id}).select().single();if(save)throw save;
     setFiles(prev=>[data,...prev]);setTitle('');
    }
   }catch(e){await supabase.storage.from(bucket).remove([path]);throw e}
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setUploading(false)}
 }
 async function download(path:string,name:string){if(!supabase)return;setError('');const{data,error}=await supabase.storage.from(bucket).download(path);if(error){setError(error.message);return}const url=URL.createObjectURL(data);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}
 async function remove(file:Row){if(!supabase||!window.confirm(`¿Quitar ${file.title} de la ficha?`))return;setError('');const{error}=await supabase.from('internship_files').delete().eq('id',file.id);if(error){setError(error.message);return}setFiles(prev=>prev.filter(f=>f.id!==file.id));const{error:storageError}=await supabase.storage.from(bucket).remove([file.storage_path]);if(storageError)setError('Se quitó de la ficha, pero no se pudo borrar el archivo del depósito: '+storageError.message)}
 return <div className="internAssets"><div className="internProfile"><div className="internAvatar">{photo?<img src={photo} alt={`Foto de ${intern?.full_name||'pasante'}`}/>:<UserRound size={34}/>}</div><div className="internProfileBody"><h3>{intern?.full_name||'Sin pasante asignado'}</h3>{intern?<><p>{intern.university||'Universidad pendiente'} · {intern.career||'Carrera pendiente'}</p><p>DNI: {intern.dni||'—'} · Teléfono: {intern.phone||'—'}</p>{intern.email&&<p><a href={`mailto:${intern.email}`}>{intern.email}</a></p>}</>:<p>La ficha personal estará disponible al vincular un pasante.</p>}<div className="actions">{phone&&<a className="ghost" href={`tel:${phone}`}><Phone size={16}/> Llamar</a>}{canEdit&&intern&&<button className="ghost" onClick={onEdit}>Editar perfil</button>}</div></div></div>
 {canEdit&&intern&&<label className="assetUpload">Foto del pasante <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f,'photo');e.target.value=''}}/></label>}
 <div className="assetHeader"><h3>Resoluciones y convenios</h3><small>Archivos privados · máximo 10 MB por archivo</small></div>
 {canEdit&&<div className="assetForm"><label>Tipo de documento<select value={category} onChange={e=>setCategory(e.target.value as Category)}>{Object.entries(categories).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>Descripción<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Número o descripción (opcional)"/></label><label className="assetUpload"><FileUp size={17}/> {uploading?'Subiendo…':'Adjuntar PDF o imagen'}<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={uploading} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f,'document');e.target.value=''}}/></label></div>}
 {error&&<p className="error" role="alert">{error}</p>}
 <div className="assetList">{Object.entries(categories).map(([key,label])=>{const docs=files.filter(f=>f.category===key);const links=linked.filter(([cat])=>cat===key).map(([,id])=>acts.find(a=>a.id===id)).filter((a):a is Row=>Boolean(a?.url));return <div className="assetGroup" key={key}><strong>{label}</strong>{docs.map(f=><div className="assetItem" key={f.id}><button className="ghost" onClick={()=>void download(f.storage_path,f.storage_path.split('/').pop()?.replace(/^[0-9a-f-]{36}-/,'')||f.title)}><Download size={16}/>{f.title}</button>{canEdit&&<button className="ghost" onClick={()=>void remove(f)} aria-label={`Quitar ${f.title}`}>Quitar</button>}</div>)}{links.map(a=><a className="ghost" key={a.id} href={a.url} target="_blank" rel="noopener noreferrer"><Download size={16}/>{a.title||`${a.number||''}/${a.year||''}`}</a>)}{!docs.length&&!links.length&&<span className="muted">Pendiente de adjuntar</span>}</div>})}</div></div>
}
