import {useMemo,useState} from 'react';
import type {DataState,Row} from './lib/data';

const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const date=(s?:string|null)=>s?`${s.slice(8,10)}/${s.slice(5,7)}/${s.slice(0,4)}`:'';
const filename=(name:string,blob:Blob)=>{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)};
const excelDate=(value?:string|null)=>value?new Date(`${value}T12:00:00Z`):null;
const sortCode=(a:Row,b:Row)=>a.code.localeCompare(b.code,'es',{numeric:true});
type ReportRow={assignment:Row;slot:Row;intern:Row;term?:Row;act?:Row;status:string;news:string};

export function monthlyRows(data:DataState,month:string){
 const start=month+'-01',end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
 const rows:ReportRow[]=data.assignments.flatMap(assignment=>{
  const finish=assignment.ended_at&&assignment.ended_at<assignment.end_date?assignment.ended_at:assignment.end_date;
  if(assignment.start_date>end||finish<start)return [];
  const slot=data.slots.find(s=>s.id===assignment.slot_id),intern=data.interns.find(i=>i.id===assignment.intern_id);
  if(!slot||!intern)return [];
  const terms=data.terms.filter(t=>t.assignment_id===assignment.id).sort((a,b)=>a.start_date.localeCompare(b.start_date));
  const term=terms.find(t=>t.start_date<=end&&t.end_date>=end)||terms.filter(t=>t.start_date<=end&&t.end_date>=start).at(-1);
  const news=[assignment.start_date>=start?'Alta':'',assignment.ended_at>=start&&assignment.ended_at<=end?'Baja':'',terms.some(t=>t.kind==='RENOVACION_6'&&t.start_date>=start&&t.start_date<=end)?'Renovación':''].filter(Boolean).join(', ');
  return [{assignment,slot,intern,term,act:data.acts.find(a=>a.id===assignment.designation_act_id),status:assignment.ended_at&&assignment.ended_at<=end?'Baja':'Vigente',news}];
 });
 return rows.sort((a,b)=>sortCode(a.slot,b.slot)||a.assignment.start_date.localeCompare(b.assignment.start_date));
}

async function downloadRrhh(data:DataState,month:string,amount:string){
 const {default:ExcelJS}=await import('exceljs');
 const rows=monthlyRows(data,month),workbook=new ExcelJS.Workbook();workbook.creator='SCIT · Dirección de Planificación y Proyectos';
 const sheet=workbook.addWorksheet('PASANTES',{views:[{state:'frozen',ySplit:3}],pageSetup:{orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0}});
 sheet.addRow(['N° ORDEN','RESOLUCIÓN','','','DEPENDENCIA','FUNCION / TAREA','PERSONA','','VINCULACIÓN','FECHA DE VENCIMIENTO (--/--/--)','PLAZO (meses)','ASIGNACIÓN (mensual)','CASA DE ESTUDIOS','MARCO LEGAL','OBSERVACIÓN','JURISDICCION','BASE']);
 sheet.mergeCells('B1:D1');sheet.mergeCells('G1:H1');
 sheet.addRow(['','N°','ESTADO','FECHA (--/--/--)','','','DNI','APELLIDO Y NOMBRE']);
 sheet.addRow([]);
 const fee=amount.trim()?Number(amount):null;
 rows.forEach((r,index)=>{
  const {assignment:a,intern:i,term:t,act}=r;
  const observation=[r.news,a.notes?.includes('verificar')?'Inicio de convenio pendiente de verificar':'',!act?.number?'Resolución de designación sin número':'',!t?'Convenio sin etapa registrada':''].filter(Boolean).join('; ');
  const row=sheet.addRow([index+1,act?.number?`Res. ${act.number}${act.year?'/'+String(act.year).slice(-2):''}`:'',r.status,excelDate(act?.act_date), 'S.C.I.T', 'Aux- Tec. Adm',i.dni||'',i.full_name,t?.kind==='RENOVACION_6'?'Renovación':'1° Instancia',excelDate(t?.end_date||a.end_date),t?.kind==='RENOVACION_6'?6:12,fee,i.university||'','Ley 26427',observation,'Ministerio de Economía',`${months[Number(month.slice(5,7))-1]} ${month.slice(0,4)}`]);
  row.getCell(4).numFmt='dd/mm/yyyy';row.getCell(10).numFmt='dd/mm/yyyy';row.getCell(12).numFmt='#,##0.00';
  row.eachCell(c=>{c.border={bottom:{style:'hair',color:{argb:'FFCDD6E4'}}};c.alignment={vertical:'middle',wrapText:true}});row.height=30;
 });
 sheet.columns.forEach((column,index)=>column.width=[10,18,14,16,16,22,16,29,16,19,14,20,20,16,42,24,19][index]);
 [1,2,3].forEach(n=>{const row=sheet.getRow(n);row.height=n===1?35:28;row.eachCell({includeEmpty:true},cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:n===1?'FF0D2847':'FFDBE6F3'}};cell.font={bold:true,color:{argb:n===1?'FFFFFFFF':'FF0D2847'},size:10};cell.alignment={vertical:'middle',horizontal:'center',wrapText:true}})});
 const buffer=await workbook.xlsx.writeBuffer();filename(`RRHH-pasantes-${month}.xlsx`,new Blob([buffer as ArrayBuffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
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

export default function Reports({data}:{data:DataState}){
 const now=new Date(),previous=new Date(now.getFullYear(),now.getMonth()-1,1),defaultMonth=`${previous.getFullYear()}-${String(previous.getMonth()+1).padStart(2,'0')}`;
 const[month,setMonth]=useState(defaultMonth),[amount,setAmount]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const rows=useMemo(()=>monthlyRows(data,month),[data,month]);
 const missing=rows.filter(r=>!r.act?.number||!r.term||!r.intern.dni||!r.intern.university).length;
 const generated=async()=>{setBusy(true);setError('');try{await downloadRrhh(data,month,amount)}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 return <div className="reportsPage"><section className="card"><span className="eyebrow">REPORTES · RRHH</span><h2>Planilla mensual de pasantes</h2><p>Seleccioná el mes vencido. Se incluyen designaciones con actividad en ese período y las novedades de alta, baja o renovación registradas. Es una reconstrucción desde los registros disponibles hoy: revisá fechas y novedades antes de enviarla.</p><div className="filters"><label>Período <input type="month" value={month} max={defaultMonth} onChange={e=>setMonth(e.target.value)}/></label><label>Asignación mensual por pasante ($) <input type="number" min="0" step="0.01" placeholder="Completar según RRHH" value={amount} onChange={e=>setAmount(e.target.value)}/></label></div><p><b>{rows.length}</b> designaciones para {months[Number(month.slice(5,7))-1]} {month.slice(0,4)}.</p>{missing>0&&<p className="reportNotice">{missing} filas tienen resolución, convenio, DNI o universidad pendiente. Las celdas sin respaldo quedan vacías y la observación marca los datos faltantes.</p>}{!amount&&<p className="reportNotice">La asignación mensual no está registrada en la base. Indicá el importe correspondiente al período o dejá esa columna vacía para revisión.</p>}{error&&<p className="error">{error}</p>}<button className="primary" disabled={busy||!rows.length||!month} onClick={generated}>{busy?'Generando…':'Descargar planilla Excel'}</button></section><section className="card"><span className="eyebrow">REPORTES · CUPOS</span><h2>Estadísticas de pasantías</h2><p>PDF con el total y la distribución actual por regional, dirección y estado.</p><button className="primary" onClick={()=>downloadStatistics(data)}>Descargar PDF</button></section></div>;
}
