import {useState} from 'react';
import {supabase} from './lib/supabase';
import type {Row} from './lib/data';
export type Field={key:string;label:string;type?:string;options?:{value:string;label:string}[];required?:boolean};
export const dateText=(d?:string)=>d?new Date(d.slice(0,10)+'T12:00:00Z').toLocaleDateString('es-AR',{timeZone:'UTC'}):'—';
export const opts=(rows:Row[],label:string)=>rows.map(r=>({value:r.id as string,label:String(r[label]||r.id)}));
export async function save(table:string,row:Row,id?:string){if(!supabase)throw Error('Supabase sin configurar');const q=id?supabase.from(table).update(row).eq('id',id):supabase.from(table).insert(row);const{error}=await q;if(error)throw error}
export async function rpc(name:string,args:Row){if(!supabase)throw Error('Supabase sin configurar');const{error}=await supabase.rpc(name,args);if(error)throw error}
export function Editor({title,fields,initial={},onSave,onClose}:{title:string;fields:Field[];initial?:Row;onSave:(row:Row)=>Promise<void>;onClose:()=>void}){
 const[row,setRow]=useState<Row>(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{const payload:Row={};fields.forEach(f=>{const v=row[f.key];payload[f.key]=v===''||v===undefined?null:f.type==='number'?Number(v):v});await onSave(payload);onClose()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
 return <div className="modalBackdrop" onClick={onClose}><form className="modal" onClick={e=>e.stopPropagation()} onSubmit={submit}><div className="titleRow"><h2>{title}</h2><button type="button" className="ghost" onClick={onClose}>Cerrar</button></div><div className="formGrid">{fields.map(f=><label key={f.key}>{f.label}{f.options?<select value={row[f.key]??''} required={f.required} onChange={e=>setRow({...row,[f.key]:e.target.value})}><option value="">Seleccionar</option>{f.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:f.type==='textarea'?<textarea value={row[f.key]??''} required={f.required} onChange={e=>setRow({...row,[f.key]:e.target.value})}/>:<input type={f.type||'text'} value={row[f.key]??''} required={f.required} onChange={e=>setRow({...row,[f.key]:e.target.value})}/>}</label>)}</div>{error&&<p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'Guardando…':'Guardar'}</button></form></div>
}
