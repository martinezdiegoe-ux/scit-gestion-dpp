import {useMemo,useState} from 'react';
import {ArrowUpRight,ClipboardPaste} from 'lucide-react';
import {normalizeExpedient,officialLink,parseOfficialExpedient,validExpedient,type OfficialResult} from './lib/officialExpedient';

type Props={initialNumber?:string;canEdit:boolean;onClose:()=>void;onSave:(result:OfficialResult,caratula:string,priority:string)=>Promise<void>};
export default function OfficialConsultation({initialNumber='',canEdit,onClose,onSave}:Props){
 const[number,setNumber]=useState(initialNumber),[raw,setRaw]=useState(''),[caratula,setCaratula]=useState(''),[priority,setPriority]=useState('NORMAL'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const normalized=normalizeExpedient(number),valid=validExpedient(normalized);
 const link=valid?officialLink(normalized):'';
 const parsed=useMemo(()=>{if(!raw.trim()||!valid)return null;try{return parseOfficialExpedient(raw,normalized)}catch{return null}},[raw,normalized,valid]);
 async function save(){if(!parsed)return;setBusy(true);setError('');try{await onSave(parsed,caratula,priority);onClose()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
 return <section className="card officialConsult"><div className="titleRow"><div><h2>Consulta oficial de expedientes</h2><p>Buscá el expediente en el portal provincial y luego incorporá el resultado verificado.</p></div><button className="ghost" onClick={onClose}>Cerrar</button></div>
 <label>Número de expediente<input value={number} onChange={e=>{setNumber(e.target.value);setRaw('');setError('')}} placeholder="13401-1380555-4 o EE-2026-00027804-APPSF-OD"/></label>
 {!valid&&number.trim()&&<p className="error">Revisá el formato del número.</p>}
 {valid&&<><div className="officialActions"><a className="ghost" href={link} target="_blank" rel="noopener noreferrer">Abrir consulta oficial <ArrowUpRight size={16}/></a><small>Si el formulario aparece debajo, presioná Buscar. Si no carga aquí, usá el enlace.</small></div><iframe key={link} title={'Consulta oficial '+normalized} src={link} referrerPolicy="no-referrer" loading="lazy"/></>}
 {valid&&<div className="officialCapture"><h3><ClipboardPaste size={17}/> Incorporar resultado</h3><p>Seleccioná y copiá la ficha que muestra el sitio oficial, desde “Expediente:” hasta “Destino:”, y pegala acá. El navegador impide que la app lea por sí sola el contenido de otro sitio.</p><textarea value={raw} onChange={e=>{setRaw(e.target.value);setError('')}} placeholder="Expediente: ...\nIniciador: ...\nFecha inicio: ...\nTema: ...\nConcepto: ...\nINFORMACIÓN DEL ÚLTIMO PASE\nFecha pase: ...\nRemitente: ...\nDestino: ..."/>
 {raw.trim()&&!parsed&&<p className="error">No pude identificar el último pase de este expediente en el texto pegado. Copiá la ficha completa y revisá el número.</p>}
 {parsed&&<><div className="officialPreview"><strong>{parsed.number}</strong><span>{parsed.topic||'Sin tema informado'}</span><b>Destino: {parsed.current_office}</b><small>Último pase: {new Date(parsed.last_transfer_at).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'})}</small><small>Remitente: {parsed.previous_office||'—'}</small></div>{canEdit&&<><div className="officialExtras"><label>Carátula interna (opcional)<input value={caratula} onChange={e=>setCaratula(e.target.value)}/></label><label>Prioridad<select value={priority} onChange={e=>setPriority(e.target.value)}><option value="BAJA">Baja</option><option value="NORMAL">Normal</option><option value="ALTA">Alta</option><option value="URGENTE">Urgente</option></select></label></div><button className="primary" disabled={busy} onClick={()=>void save()}>{busy?'Guardando…':initialNumber?'Guardar actualización':'Agendar expediente'}</button></>}</>}
 {error&&<p className="error" role="alert">{error}</p>}</div>}
 </section>;
}
