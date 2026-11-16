import {BarChart3} from 'lucide-react';
import {lazy,Suspense,useMemo,useState} from 'react';
import type {DataState,Row} from './lib/data';
import {monthlyRows,createRrhhSheet,rrhhOptions,rrhhFileOptions} from './lib/rrhhWorkbook';

const CadastralStats=lazy(()=>import('./CadastralStats'));
const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const date=(s?:string|null)=>s?`${s.slice(8,10)}/${s.slice(5,7)}/${s.slice(0,4)}`:'';
const filename=(name:string,blob:Blob)=>{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)};
async function downloadRrhh(data:DataState,month:string,amount:string){
 const {default:writeExcelFile}=await import('write-excel-file/browser');
 const blob=await writeExcelFile(createRrhhSheet(data,month,amount),rrhhOptions,rrhhFileOptions).toBlob();
 filename(`RRHH-pasantes-${month}.xlsx`,blob);
}

async function downloadStatistics(data:DataState){
 const {jsPDF}=await import('jspdf');
 const doc=new jsPDF({unit:'mm',format:'a4'}),total=data.slots.length;
 const states=['CUBIERTO','EN_GESTION','VACANTE','SUSPENDIDO'];
 const count=(rows:Row[],status:string)=>rows.filter(s=>s.status===status).length;
 const office=(s:Row)=>`${s.office||'Sin definir'}${['CATASTRO ECONOMICO','PUBLICIDAD CATASTRAL','OBJETOS TERRITORIALES'].includes(s.office)?' · '+s.city:''}`;
 const groups=[...new Set(data.slots.map(office))].sort((a,b)=>a.localeCompare(b,'es'));
 const blue:[number,number,number]=[13,40,71];doc.setFillColor(...blue);doc.rect(0,0,210,41,'F');doc.setTextColor(255);doc.setFontSize(19);doc.text('Pasantías · Estadísticas de cupos',15,19);doc.setFontSize(10);doc.text(`SCIT · Dirección de Planificación y Proyectos | ${new Date().toLocaleDateString('es-AR')}`,15,29);
 let y=51;doc.setTextColor(...blue);doc.setFontSize(12);doc.text(`Total: ${total} cupos`,15,y);y+=9;
 const section=(title:string,items:{name:string;slots:Row[]}[])=>{doc.setFillColor(223,232,243);doc.rect(15,y-6,180,8,'F');doc.setFont('helvetica','bold');doc.setFontSize(10);doc.text(title,17,y);y+=8;doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text('Dependencia / regional',17,y);doc.text('Total',122,y);doc.text('Cub.',143,y);doc.text('Gest.',160,y);doc.text('Vac.',178,y);y+=3;doc.line(15,y,195,y);y+=6;items.forEach(({name,slots})=>{if(y>276){doc.addPage();y=18}doc.text(name.slice(0,58),17,y);doc.text(String(slots.length),124,y);doc.text(String(count(slots,'CUBIERTO')),145,y);doc.text(String(count(slots,'EN_GESTION')),162,y);doc.text(String(count(slots,'VACANTE')),180,y);y+=7});y+=6};
 section('Estado general',[{name:'Todos los cupos',slots:data.slots}]);
 section('Por regional',['Santa Fe','Rosario'].map(name=>({name,slots:data.slots.filter(s=>s.city===name)})));
 section('Por dirección',groups.map(name=>({name,slots:data.slots.filter(s=>office(s)===name)})));
 doc.setFontSize(8);doc.setTextColor(95);doc.text(`Fuente: estado actual de los cupos en la aplicación. Categorías: ${states.join(', ')}.`,15,287);
 doc.save(`SCIT-estadisticas-cupos-${new Date().toISOString().slice(0,10)}.pdf`);
}

export default function Reports({data,canEdit}:{data:DataState;canEdit:boolean}){
 const now=new Date(),previous=new Date(now.getFullYear(),now.getMonth()-1,1),defaultMonth=`${previous.getFullYear()}-${String(previous.getMonth()+1).padStart(2,'0')}`;
 const[month,setMonth]=useState(defaultMonth),[amount,setAmount]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [showCadastral,setShowCadastral]=useState(false);
 const rows=useMemo(()=>monthlyRows(data,month),[data,month]);
 const missing=rows.filter(r=>!r.act?.number||!r.term||!r.intern.dni||!r.intern.university).length;
 const generated=async()=>{setBusy(true);setError('');try{await downloadRrhh(data,month,amount)}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 if(showCadastral)return <Suspense fallback={<p role="status">Cargando estadísticas…</p>}><CadastralStats back={()=>setShowCadastral(false)} canEdit={canEdit}/></Suspense>;
 return <div className="reportsPage"><section className="card"><h2>Trámites catastrales</h2><p>Consultá pendientes, demoras, etapas y actividad por regional.</p><button className="primary" onClick={()=>setShowCadastral(true)}><BarChart3 size={17}/> Estadísticas y datos</button></section><section className="card"><span className="eyebrow">REPORTES · RRHH</span><h2>Planilla mensual de pasantes</h2><p>Seleccioná el mes vencido. Se incluyen designaciones con actividad en ese período y las novedades de alta, baja o renovación registradas. Es una reconstrucción desde los registros disponibles hoy: revisá fechas y novedades antes de enviarla.</p><div className="filters"><label>Período <input type="month" value={month} max={defaultMonth} onChange={e=>setMonth(e.target.value)}/></label><label>Asignación mensual por pasante ($) <input type="number" min="0" step="0.01" placeholder="Completar según RRHH" value={amount} onChange={e=>setAmount(e.target.value)}/></label></div><p><b>{rows.length}</b> designaciones para {months[Number(month.slice(5,7))-1]} {month.slice(0,4)}.</p>{missing>0&&<p className="reportNotice">{missing} filas tienen resolución, convenio, DNI o universidad pendiente. Las celdas sin respaldo quedan vacías y la observación marca los datos faltantes.</p>}{!amount&&<p className="reportNotice">La asignación mensual no está registrada en la base. Indicá el importe correspondiente al período o dejá esa columna vacía para revisión.</p>}{error&&<p className="error">{error}</p>}<button className="primary" disabled={busy||!rows.length||!month} onClick={generated}>{busy?'Generando…':'Descargar planilla Excel'}</button></section><section className="card"><span className="eyebrow">REPORTES · CUPOS</span><h2>Estadísticas de pasantías</h2><p>PDF con el total y la distribución actual por regional, dirección y estado.</p><button className="primary" onClick={()=>downloadStatistics(data)}>Descargar PDF</button></section></div>;
}
